using System.Collections.Generic;
using System.Linq;
using Mafi;
using Mafi.Core.Buildings.Settlements;
using Mafi.Core.Population;
using Mafi.Core.Stats;
using Mafi.Core.WebApi;

namespace ControlRoom;

/// <summary>
/// Population and settlement health, which the game's /api/v1 doesn't expose. The data comes from the game's
/// <see cref="PopsHealthManager"/> (health, disease, births and deaths), <see cref="SettlementsManager"/> (housing,
/// homeless, starving) and <see cref="WorkersManager"/>, the sources of the in-game population window.
///
/// Percentages are written as percent (50 = 50%). Health points per category (generated / consumed) are percentage
/// points of health: the game stores them as whole points (checked in game: Food 12 = the record's +12%).
/// `health.thisMonth` stays 0 until the month ends; `lastMonth` is the current reading.
/// The managers are looked up per request, so a missing one only makes the route answer 404.
/// </summary>
[GlobalDependency(RegistrationMode.AsSelf)]
public sealed class PopulationRoutes {

	private const string PREFIX = "/api/mods/control-room/population";
	/// <summary>The health stats store whole percentage points.</summary>
	private const double RAW_PER_POINT = 1.0;

	private readonly DependencyResolver m_resolver;

	public PopulationRoutes(DependencyResolver resolver) {
		m_resolver = resolver;
	}

	private static double Pct(Percent p) => p.ToDouble() * 100.0;

	[WebRoute(PREFIX, WebRouteStage.Sim, "GET",
		"Population now: people, housing, homeless, starving, workers, health (this/last month, base), what raised and lowered health last month, disease, births and deaths, and each settlement.")]
	public WebRouteResponse Population() {
		bool hasSettlements = m_resolver.TryGetResolvedDependency(out SettlementsManager settlements);
		bool hasHealth = m_resolver.TryGetResolvedDependency(out PopsHealthManager health);
		bool hasWorkers = m_resolver.TryGetResolvedDependency(out WorkersManager workers);
		if (!hasSettlements && !hasHealth) {
			return WebRouteResponse.NotFound("The population managers aren't available.");
		}

		var json = new Json().Obj();

		if (hasSettlements) {
			IReadOnlyCollection<Settlement> all = settlements.Settlements;
			json.Prop("population", all.Sum(s => s.Population))
				.Prop("populationChange", settlements.LastPopulationDiff)
				.Prop("housing", settlements.TotalHousingCapacity)
				.Prop("freeHousing", settlements.FreeHousingCapacity)
				.Prop("homeless", settlements.NumberOfHomeless)
				.Prop("starving", settlements.ArePeopleStarving)
				.Prop("starvedLastMonth", settlements.AmountStarvedToDeathLastMonth)
				.Prop("monthsOfFood", settlements.MonthsOfFood)
				.Prop("researchBonus", Pct(settlements.ResearchEfficiencyBonus));

			json.Key("settlements").Arr();
			// Settlements have no id or name of their own (a settlement is a cluster of housing modules), so they are
			// numbered in the game's order.
			int index = 0;
			foreach (Settlement s in all) {
				index++;
				json.Obj()
					.Prop("index", index)
					.Prop("population", s.Population)
					.Prop("housing", s.TotalHousingCapacity)
					.Prop("freeHousing", s.FreeHousingCapacity)
					.Prop("starving", s.ArePeopleStarving)
					.Prop("starvedLastMonth", s.AmountStarvedToDeathLastMonth)
					.Prop("monthsOfFood", s.MonthsOfFood)
					.Prop("hasFoodModule", !s.HasNoFoodModule)
					.Prop("healthFromFood", Pct(s.NominalHealthLastDayFromFood))
					.Prop("foodCategoriesWithHealth", Pct(s.FoodCategoriesWithHealthSatisfaction))
					.Prop("healthCategoriesTotal", s.CategoriesWithHealthBenefitTotal)
					.Prop("hospitals", s.AllHospitals.Count)
					.Prop("landfill", s.LandfillInSettlement.Value.ToDouble())
					.Prop("landfillLimit", s.LandfillLimitForCurrentPopulation.Value)
					.Prop("healthPenaltyFromWaste", Pct(s.NominalHealthPenaltyFromWasteLastDay));
				json.Key("needs").Arr();
				foreach (PopNeed need in s.AllNeeds) {
					if (!need.ShouldBeShown) {
						continue;
					}
					json.Obj()
						.Prop("id", need.Proto.Id.Value)
						.Prop("name", PowerRoutes.Text(need.Proto.Strings.Name) ?? need.Proto.Id.Value)
						.Prop("food", need.IsFoodNeed)
						.Prop("healthcare", need.IsHealthcareNeed)
						.Prop("satisfiedLastMonth", Pct(need.PercentSatisfiedLastMonth))
						.Prop("satisfiedNow", Pct(need.PercentSatisfiedAfterLastUpdate))
						.Prop("unity", need.UnityAfterLastUpdate.Value.ToDouble())
						.Prop("unityMax", need.MaxAfterLastUpdate.Value.ToDouble())
						.EndObj();
				}
				json.EndArr();
				json.EndObj();
			}
			json.EndArr();
		}

		if (hasWorkers) {
			json.Key("workers").Obj()
				.Prop("free", workers.AmountOfFreeWorkers)
				.Prop("freeOrMissing", workers.AmountOfFreeWorkersOrMissing)
				.Prop("withheld", workers.NumberOfWorkersWithheld);
			json.Key("needed"); PowerRoutes.Periods(json, workers.TotalWorkersNeededStats, v => v);
			json.EndObj();
		}

		if (hasHealth) {
			HealthStatistics stats = health.HealthStats;
			json.Key("health").Obj()
				.Prop("thisMonth", Pct(stats.HealthThisMonth))
				.Prop("lastMonth", Pct(stats.HealthLastMonth))
				.Prop("min", Pct(PopsHealthManager.MIN_HEALTH))
				.Prop("unityLastMonth", health.UpointsForHealthLastMonth.Value.ToDouble());
			json.Key("generated"); PowerRoutes.Periods(json, stats.GeneratedTotalStats, v => v / RAW_PER_POINT);
			json.Key("consumed"); PowerRoutes.Periods(json, stats.ConsumedTotalStats, v => v / RAW_PER_POINT);

			// What raised and lowered health last month, as the game itemizes it.
			json.Key("lastMonthRecords").Arr();
			var records = stats.LastMonthRecords;
			for (int i = 0; i < records.Count; i++) {
				HealthStatistics.Entry e = records[i];
				json.Obj()
					.Prop("category", e.Category.Id.Value)
					.Prop("name", PowerRoutes.Text(e.Category.Strings.Name) ?? e.Category.Id.Value)
					.Prop("change", Pct(e.Change))
					.Prop("max", Pct(e.Max))
					.EndObj();
			}
			json.EndArr();

			json.Key("categories").Arr();
			foreach (HealthPointsCategoryProto c in Categories(stats)) {
				json.Obj().Prop("id", c.Id.Value).Prop("name", PowerRoutes.Text(c.Strings.Name) ?? c.Id.Value);
				json.Key("generated"); PowerRoutes.Periods(json, Get(stats.GeneratedStats, c), v => v / RAW_PER_POINT);
				json.Key("consumed"); PowerRoutes.Periods(json, Get(stats.ConsumedStats, c), v => v / RAW_PER_POINT);
				json.EndObj();
			}
			json.EndArr();
			json.EndObj();

			json.Key("disease");
			if (health.CurrentDisease.HasValue) {
				DiseaseProto d = health.CurrentDisease.Value;
				json.Obj()
					.Prop("id", d.Id.Value)
					.Prop("name", PowerRoutes.Text(d.Strings.Name) ?? d.Id.Value)
					.Prop("monthsLeft", health.CurrentDiseaseMonthsLeft)
					.Prop("mortality", Pct(health.CurrentDiseaseMortality))
					.EndObj();
			} else {
				json.Val((string)null);
			}

			BirthStatistics births = health.BirthStats;
			json.Key("births").Obj()
				.Prop("rateThisMonth", Pct(births.BirthRateThisMonth))
				.Prop("rateLastMonth", Pct(births.BirthRateLastMonth))
				.Prop("growthPaused", health.IsPopulationGrowthPaused);
			json.Key("born"); WriteSum(json, health.BornTotal);
			json.Key("lost"); WriteSum(json, health.LostTotal);
			json.Key("lastMonthRecords").Arr();
			var birthRecords = births.LastMonthRecords;
			for (int i = 0; i < birthRecords.Count; i++) {
				BirthStatistics.Entry e = birthRecords[i];
				json.Obj()
					.Prop("category", e.Category.Id.Value)
					.Prop("name", PowerRoutes.Text(e.Category.Strings.Name) ?? e.Category.Id.Value)
					.Prop("change", Pct(e.Change))
					.Prop("max", Pct(e.Max))
					.EndObj();
			}
			json.EndArr();
			json.EndObj();
		}

		return WebRouteResponse.Json(json.EndObj().ToString());
	}

	[WebRoute(PREFIX + "/history", WebRouteStage.Sim, "GET",
		"Health generated and consumed (percentage points, period averages), in total and per category, plus people born and lost. resolution = days | months (default) | years, count = 1-1000 (default 24). Newest completed period first.")]
	public WebRouteResponse History(string resolution = "months", int count = 24) {
		if (PowerRoutes.Invalid(resolution, count) is WebRouteResponse bad) {
			return bad;
		}
		if (!m_resolver.TryGetResolvedDependency(out PopsHealthManager health)) {
			return WebRouteResponse.NotFound("The health manager isn't available.");
		}
		HealthStatistics stats = health.HealthStats;
		var json = new Json().Obj().Prop("resolution", resolution).Prop("count", count);
		json.Key("generated"); PowerRoutes.Series(json, stats.GeneratedTotalStats, v => v / RAW_PER_POINT, resolution, count);
		json.Key("consumed"); PowerRoutes.Series(json, stats.ConsumedTotalStats, v => v / RAW_PER_POINT, resolution, count);
		json.Key("born"); PowerRoutes.Series(json, health.BornTotal, v => v.ToDouble(), resolution, count);
		json.Key("lost"); PowerRoutes.Series(json, health.LostTotal, v => v.ToDouble(), resolution, count);
		json.Key("categories").Arr();
		foreach (HealthPointsCategoryProto c in Categories(stats)) {
			json.Obj().Prop("id", c.Id.Value).Prop("name", PowerRoutes.Text(c.Strings.Name) ?? c.Id.Value);
			json.Key("generated"); PowerRoutes.Series(json, Get(stats.GeneratedStats, c), v => v / RAW_PER_POINT, resolution, count);
			json.Key("consumed"); PowerRoutes.Series(json, Get(stats.ConsumedStats, c), v => v / RAW_PER_POINT, resolution, count);
			json.EndObj();
		}
		json.EndArr();
		return WebRouteResponse.Json(json.EndObj().ToString());
	}

	private static IEnumerable<HealthPointsCategoryProto> Categories(HealthStatistics stats) =>
		stats.GeneratedStats.Keys.Concat(stats.ConsumedStats.Keys).Distinct().OrderBy(c => c.Id.Value);

	private static IntAvgStats Get(IReadOnlyDictionary<HealthPointsCategoryProto, IntAvgStats> all, HealthPointsCategoryProto c) =>
		all.TryGetValue(c, out IntAvgStats s) ? s : null;

	private static void WriteSum(Json json, Fix32SumStats s) {
		json.Obj()
			.Prop("lastMonth", s.LastMonth.ToDouble())
			.Prop("thisYear", s.ThisYear.ToDouble())
			.Prop("lastYear", s.LastYear.ToDouble())
			.Prop("lifetime", s.Lifetime.ToDouble())
			.EndObj();
	}
}
