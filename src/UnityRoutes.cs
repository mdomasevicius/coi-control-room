using System.Collections.Generic;
using System.Linq;
using Mafi;
using Mafi.Collections;
using Mafi.Core.Entities;
using Mafi.Core.Population;
using Mafi.Core.Population.Edicts;
using Mafi.Core.Products;
using Mafi.Core.Prototypes;
using Mafi.Core.Stats;
using Mafi.Core.WebApi;
using Mafi.Localization;

namespace ControlRoom;

/// <summary>
/// Unity (upoints) statistics, which the game's own /api/v1 doesn't expose. The data comes from the game's
/// <see cref="UpointsManager"/>, the same source as the in-game Unity window.
/// Routes run on the Sim stage (like the game's /api/v1 read routes), so reading simulation state is safe.
/// </summary>
[GlobalDependency(RegistrationMode.AsSelf)]
public sealed class UnityRoutes {

	private const string PREFIX = "/api/mods/control-room/unity";
	private const int MAX_COUNT = 1000;

	private readonly UpointsManager m_unity;
	private readonly ProtosDb m_protos;
	/// <summary>Display name -> id of the proto it names, for ledger icons. Built on first use.</summary>
	private Dictionary<string, string> m_iconByName;

	public UnityRoutes(UpointsManager unity, ProtosDb protos) {
		m_unity = unity;
		m_protos = protos;
	}

	[WebRoute(PREFIX, WebRouteStage.Sim, "GET",
		"Unity now: amount, cap, last month's net, generated/consumed per category (last day/month, this/last year, lifetime) and this month's itemized records.")]
	public WebRouteResponse Unity() {
		UpointsStats stats = m_unity.Stats;
		var json = new Json().Obj()
			// Quantity is the internal product amount (52 Unity reads as 53248); the game's own Quantity -> Upoints
			// conversion gives the number its UI shows.
			.Prop("quantity", m_unity.Quantity.Upoints().Value.ToDouble())
			.Prop("cap", m_unity.TotalUnityCap.Value.ToDouble());

		json.Key("lastMonth").Obj()
			.Prop("net", m_unity.DiffForLastMonth.Value.ToDouble())
			.Prop("possibleNet", m_unity.PossibleDiffForLastMonth.Value.ToDouble())
			.Prop("netWithOneTimeActions", m_unity.DiffForLastMonthWithOneTimeActions.Value.ToDouble())
			.EndObj();

		json.Key("categories").Arr();
		foreach (UpointsStatsCategoryProto category in Categories(stats)) {
			json.Obj();
			WriteCategory(json, category);
			json.Key("generated"); WritePeriods(json, stats.GeneratedStats, category);
			json.Key("consumed"); WritePeriods(json, stats.ConsumedStats, category);
			json.EndObj();
		}
		json.EndArr();

		json.Key("thisMonth").Arr();
		var records = stats.ThisMonthRecords;
		for (int i = 0; i < records.Count; i++) {
			UpointsStats.Entry entry = records[i];
			string title = Text(entry.Title) ?? Text(entry.Category.Strings.Name);
			json.Obj()
				.Prop("category", entry.Category.Id.Value)
				.Prop("statsCategory", entry.Category.StatsCategory?.Id.Value)
				.Prop("title", title)
				.Prop("icon", IconFor(title))
				.Prop("exchanged", entry.Exchanged.Value.ToDouble())
				.Prop("max", entry.Max.Value.ToDouble())
				.Prop("possibleMax", entry.PossibleMax.Value.ToDouble())
				.EndObj();
		}
		json.EndArr();

		return WebRouteResponse.Json(json.EndObj().ToString());
	}

	[WebRoute(PREFIX + "/history", WebRouteStage.Sim, "GET",
		"Unity generated and consumed per category over time. resolution = days | months (default) | years, count = 1-1000 (default 24).")]
	public WebRouteResponse History(string resolution = "months", int count = 24) {
		if (resolution != "days" && resolution != "months" && resolution != "years") {
			return WebRouteResponse.InvalidParameter("resolution", $"Invalid value '{resolution}'. Allowed values: days, months, years.");
		}
		if (count < 1 || count > MAX_COUNT) {
			return WebRouteResponse.InvalidParameter("count", $"count must be between 1 and {MAX_COUNT}.");
		}

		UpointsStats stats = m_unity.Stats;
		var values = new Lyst<Fix32>();
		var json = new Json().Obj()
			.Prop("resolution", resolution)
			.Prop("count", count);

		json.Key("categories").Arr();
		foreach (UpointsStatsCategoryProto category in Categories(stats)) {
			json.Obj();
			WriteCategory(json, category);
			json.Key("generated"); WriteSeries(json, stats.GeneratedStats, category, resolution, count, values);
			json.Key("consumed"); WriteSeries(json, stats.ConsumedStats, category, resolution, count, values);
			json.EndObj();
		}
		json.EndArr();

		return WebRouteResponse.Json(json.EndObj().ToString());
	}

	/// <summary>Every category that has generated or consumed stats, sorted by id so the order is stable.</summary>
	private static IEnumerable<UpointsStatsCategoryProto> Categories(UpointsStats stats) =>
		stats.GeneratedStats.Keys.Concat(stats.ConsumedStats.Keys).Distinct().OrderBy(c => c.Id.Value);

	private static void WriteCategory(Json json, UpointsStatsCategoryProto category) {
		json.Prop("id", category.Id.Value)
			.Prop("name", Text(category.Strings.Name) ?? category.Id.Value)
			.Prop("icon", Icon(category.Graphics?.IconPath))
			.Prop("oneTimeAction", category.IsOneTimeAction)
			.Prop("ignoreInStats", category.IgnoreInStats)
			.Prop("hidden", category.HideInUI);
	}

	private static void WritePeriods(Json json, IReadOnlyDictionary<UpointsStatsCategoryProto, Fix32SumStats> all,
		UpointsStatsCategoryProto category) {
		if (!all.TryGetValue(category, out Fix32SumStats s)) {
			json.Val((string)null);
			return;
		}
		json.Obj()
			.Prop("lastDay", s.LastDay.ToDouble())
			.Prop("lastMonth", s.LastMonth.ToDouble())
			.Prop("thisYear", s.ThisYear.ToDouble())
			.Prop("lastYear", s.LastYear.ToDouble())
			.Prop("lifetime", s.Lifetime.ToDouble())
			.EndObj();
	}

	private static void WriteSeries(Json json, IReadOnlyDictionary<UpointsStatsCategoryProto, Fix32SumStats> all,
		UpointsStatsCategoryProto category, string resolution, int count, Lyst<Fix32> values) {
		if (!all.TryGetValue(category, out Fix32SumStats s)) {
			json.Val((string)null);
			return;
		}
		values.Clear();
		switch (resolution) {
			case "days": s.GetLastNDays(count, values); break;
			case "years": s.GetLastNYears(count, values); break;
			default: s.GetLastNMonths(count, values); break;
		}
		json.Arr();
		for (int i = 0; i < values.Count; i++) {
			json.Val(values[i].ToDouble());
		}
		json.EndArr();
	}

	/// <summary>
	/// The ledger keeps only a display title ("Bread", "Research lab IV", "Recycling increase V"), not the thing it is
	/// about, so the icon is found by name: products first (so "Water" is the product), then buildings and machines,
	/// then edicts. The id is what /api/v1/icons/{id} takes; null when no proto has that name.
	/// </summary>
	private string IconFor(string title) {
		if (title == null) {
			return null;
		}
		if (m_iconByName == null) {
			var byName = new Dictionary<string, string>();
			void add(IEnumerable<Proto> protos) {
				foreach (Proto proto in protos) {
					string name = Text(proto.Strings.Name);
					if (name != null && !byName.ContainsKey(name)) {
						byName[name] = proto.Id.Value;
					}
				}
			}
			add(m_protos.All<ProductProto>());
			add(m_protos.All<EntityProto>());
			add(m_protos.All<EdictProto>());
			m_iconByName = byName;
		}
		return m_iconByName.TryGetValue(title, out string id) ? id : null;
	}

	private static string Text(LocStr str) => str.IsUnset ? null : str.TranslatedString;

	/// <summary>The game uses "EMPTY" for "no icon".</summary>
	private static string Icon(string path) => string.IsNullOrEmpty(path) || path == "EMPTY" ? null : path;
}
