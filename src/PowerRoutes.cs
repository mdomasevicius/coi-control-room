using System;
using System.Collections.Generic;
using System.Linq;
using Mafi;
using Mafi.Collections;
using Mafi.Core.Entities;
using Mafi.Core.Factory.ComputingPower;
using Mafi.Core.Factory.ElectricPower;
using Mafi.Core.Prototypes;
using Mafi.Core.Stats;
using Mafi.Core.WebApi;
using Mafi.Localization;

namespace ControlRoom;

/// <summary>
/// Electricity and computing, which the game's /api/v1 doesn't expose (they are virtual products it leaves out).
/// The data comes from the game's <see cref="ElectricityManager"/> and <see cref="ComputingManager"/>, the same
/// sources as the in-game power and computing windows: values right now (this tick), averages per period, and the
/// same per building type.
///
/// The managers are looked up per request rather than injected, so a game version without one only makes its route
/// answer 404 instead of breaking the mod. Routes run on the Sim stage, like the game's own read routes.
/// </summary>
[GlobalDependency(RegistrationMode.AsSelf)]
public sealed class PowerRoutes {

	private const string PREFIX = "/api/mods/control-room";
	private const int MAX_COUNT = 1000;

	private readonly DependencyResolver m_resolver;

	public PowerRoutes(DependencyResolver resolver) {
		m_resolver = resolver;
	}

	// ---- electricity ----

	[WebRoute(PREFIX + "/electricity", WebRouteStage.Sim, "GET",
		"Electricity now (generated, consumed, demanded, capacity, wasted), averages per period (last day/month, this/last year, lifetime) and the same per building type. Values in kW.")]
	public WebRouteResponse Electricity() {
		if (!m_resolver.TryGetResolvedDependency(out ElectricityManager power)) {
			return WebRouteResponse.NotFound("The electricity manager isn't available.");
		}
		var json = new Json().Obj();
		json.Key("now").Obj()
			.Prop("generated", power.GeneratedThisTick.Value)
			.Prop("consumed", power.ConsumedThisTick.Value)
			.Prop("demanded", power.DemandedThisTick.Value)
			.Prop("surplusDemanded", power.SurplusDemandedThisTick.Value)
			.Prop("capacity", power.GenerationCapacityThisTick.Value)
			.Prop("maxCapacity", power.MaxGenerationCapacity.Value)
			.Prop("wasted", power.WastedElectricityThisTick.Value)
			// The game's own formatting ("12.4 MW"), so the unit is never guessed.
			.Prop("generatedText", power.GeneratedThisTick.Format().Value)
			.EndObj();
		json.Prop("generatorCount", power.GeneratorsCount)
			.Prop("consumerCount", power.ConsumersCount)
			.Prop("ignoreMissing", power.IgnoreMissingPower)
			.Prop("freeGrace", power.HasFreePowerGrace);

		json.Key("production"); Periods(json, power.ProductionStats, e => e.Value);
		json.Key("consumption"); Periods(json, power.ConsumptionStats, e => e.Value);
		json.Key("capacity"); Periods(json, power.GenerationCapacityStats, e => e.Value);

		json.Key("producers").Arr();
		foreach (ElectricityManager.ProductionPerProto p in power.GetProductionStatsPerProto()) {
			json.Obj();
			WriteProto(json, p.ProducerProto);
			json.Prop("count", p.EntitiesTotal)
				.Prop("produced", p.LastTick.Produced.Value)
				.Prop("wasted", p.LastTick.Wasted.Value);
			json.Key("average"); Periods(json, p.ProductionStats, e => e.Value);
			json.EndObj();
		}
		json.EndArr();

		json.Key("consumers").Arr();
		foreach (ElectricityManager.ConsumptionPerProto c in power.GetConsumptionStatsPerProto()) {
			json.Obj();
			WriteProto(json, c.ConsumerProto);
			json.Prop("count", c.EntitiesTotal)
				.Prop("consumed", c.LastTick.Consumed.Value)
				.Prop("demanded", c.LastTick.Demand.Value)
				.Prop("max", c.LastTick.MaxPossibleConsumption.Value);
			json.Key("average"); Periods(json, c.ConsumptionStats, e => e.Value);
			json.EndObj();
		}
		json.EndArr();

		return WebRouteResponse.Json(json.EndObj().ToString());
	}

	[WebRoute(PREFIX + "/electricity/history", WebRouteStage.Sim, "GET",
		"Electricity production, consumption and generation capacity over time (period averages, kW), in total and per building type. resolution = days | months (default) | years, count = 1-1000 (default 24). Newest completed period first.")]
	public WebRouteResponse ElectricityHistory(string resolution = "months", int count = 24) {
		if (Invalid(resolution, count) is WebRouteResponse bad) {
			return bad;
		}
		if (!m_resolver.TryGetResolvedDependency(out ElectricityManager power)) {
			return WebRouteResponse.NotFound("The electricity manager isn't available.");
		}
		var json = new Json().Obj().Prop("resolution", resolution).Prop("count", count);
		json.Key("production"); Series(json, power.ProductionStats, e => e.Value, resolution, count);
		json.Key("consumption"); Series(json, power.ConsumptionStats, e => e.Value, resolution, count);
		json.Key("capacity"); Series(json, power.GenerationCapacityStats, e => e.Value, resolution, count);
		json.Key("producers").Arr();
		foreach (ElectricityManager.ProductionPerProto p in power.GetProductionStatsPerProto()) {
			json.Obj();
			WriteProto(json, p.ProducerProto);
			json.Key("values"); Series(json, p.ProductionStats, e => e.Value, resolution, count);
			json.EndObj();
		}
		json.EndArr();
		json.Key("consumers").Arr();
		foreach (ElectricityManager.ConsumptionPerProto c in power.GetConsumptionStatsPerProto()) {
			json.Obj();
			WriteProto(json, c.ConsumerProto);
			json.Key("values"); Series(json, c.ConsumptionStats, e => e.Value, resolution, count);
			json.EndObj();
		}
		json.EndArr();
		return WebRouteResponse.Json(json.EndObj().ToString());
	}

	// ---- computing ----

	[WebRoute(PREFIX + "/computing", WebRouteStage.Sim, "GET",
		"Computing now (produced, demanded, capacity), averages per period and the same per building type. Values in the game's computing units (TFLOPS).")]
	public WebRouteResponse Computing() {
		if (!m_resolver.TryGetResolvedDependency(out ComputingManager computing)) {
			return WebRouteResponse.NotFound("The computing manager isn't available.");
		}
		var json = new Json().Obj();
		json.Key("now").Obj()
			.Prop("produced", computing.ProducedLastTick.Value)
			.Prop("demanded", computing.DemandedThisTick.Value)
			.Prop("capacity", computing.GenerationCapacityThisTick.Value)
			.Prop("producedText", computing.ProducedLastTick.Format().Value)
			.EndObj();
		json.Prop("ignoreMissing", computing.IgnoreMissingComputing)
			.Prop("freeGrace", computing.HasFreeComputingGrace);

		json.Key("production"); Periods(json, computing.ProductionStats, c => c.Value);
		json.Key("demand"); Periods(json, computing.DemandStats, c => c.Value);
		json.Key("capacity"); Periods(json, computing.GenerationCapacityStats, c => c.Value);

		json.Key("producers").Arr();
		foreach (ComputingManager.ProductionPerProto p in computing.GetProductionStatsPerProto()) {
			json.Obj();
			WriteProto(json, p.ProducerProto);
			json.Prop("count", p.EntitiesTotal)
				.Prop("produced", p.LastTick.Produced.Value)
				.Prop("maxCapacity", p.LastTick.MaxGenerationCapacity.Value);
			json.Key("average"); Periods(json, p.ProductionStats, c => c.Value);
			json.EndObj();
		}
		json.EndArr();

		json.Key("consumers").Arr();
		foreach (ComputingManager.ConsumptionPerProto c in computing.GetConsumptionStatsPerProto()) {
			json.Obj();
			WriteProto(json, c.ConsumerProto);
			json.Prop("count", c.EntitiesTotal)
				.Prop("consumed", c.LastTick.Consumed.Value)
				.Prop("demanded", c.LastTick.Demand.Value)
				.Prop("max", c.LastTick.MaxPossibleConsumption.Value);
			json.Key("average"); Periods(json, c.ConsumptionStats, v => v.Value);
			json.EndObj();
		}
		json.EndArr();

		return WebRouteResponse.Json(json.EndObj().ToString());
	}

	[WebRoute(PREFIX + "/computing/history", WebRouteStage.Sim, "GET",
		"Computing production, demand and generation capacity over time (period averages), in total and per building type. resolution = days | months (default) | years, count = 1-1000 (default 24). Newest completed period first.")]
	public WebRouteResponse ComputingHistory(string resolution = "months", int count = 24) {
		if (Invalid(resolution, count) is WebRouteResponse bad) {
			return bad;
		}
		if (!m_resolver.TryGetResolvedDependency(out ComputingManager computing)) {
			return WebRouteResponse.NotFound("The computing manager isn't available.");
		}
		var json = new Json().Obj().Prop("resolution", resolution).Prop("count", count);
		json.Key("production"); Series(json, computing.ProductionStats, c => c.Value, resolution, count);
		json.Key("demand"); Series(json, computing.DemandStats, c => c.Value, resolution, count);
		json.Key("capacity"); Series(json, computing.GenerationCapacityStats, c => c.Value, resolution, count);
		json.Key("producers").Arr();
		foreach (ComputingManager.ProductionPerProto p in computing.GetProductionStatsPerProto()) {
			json.Obj();
			WriteProto(json, p.ProducerProto);
			json.Key("values"); Series(json, p.ProductionStats, c => c.Value, resolution, count);
			json.EndObj();
		}
		json.EndArr();
		json.Key("consumers").Arr();
		foreach (ComputingManager.ConsumptionPerProto c in computing.GetConsumptionStatsPerProto()) {
			json.Obj();
			WriteProto(json, c.ConsumerProto);
			json.Key("values"); Series(json, c.ConsumptionStats, v => v.Value, resolution, count);
			json.EndObj();
		}
		json.EndArr();
		return WebRouteResponse.Json(json.EndObj().ToString());
	}

	// ---- shared ----

	internal static WebRouteResponse Invalid(string resolution, int count) {
		if (resolution != "days" && resolution != "months" && resolution != "years") {
			return WebRouteResponse.InvalidParameter("resolution", $"Invalid value '{resolution}'. Allowed values: days, months, years.");
		}
		if (count < 1 || count > MAX_COUNT) {
			return WebRouteResponse.InvalidParameter("count", $"count must be between 1 and {MAX_COUNT}.");
		}
		return null;
	}

	/// <summary>Period values of a stats object: { lastDay, lastMonth, thisYear, lastYear, lifetime }.</summary>
	internal static void Periods<T>(Json json, ItemStats<T> s, Func<T, double> value) {
		if (s == null) {
			json.Val((string)null);
			return;
		}
		json.Obj()
			.Prop("lastDay", value(s.LastDay))
			.Prop("lastMonth", value(s.LastMonth))
			.Prop("thisYear", value(s.ThisYear))
			.Prop("lastYear", value(s.LastYear))
			.Prop("lifetime", value(s.Lifetime))
			.EndObj();
	}

	/// <summary>The last `count` periods of a stats object, newest completed period first.</summary>
	internal static void Series<T>(Json json, ItemStats<T> s, Func<T, double> value, string resolution, int count) {
		if (s == null) {
			json.Val((string)null);
			return;
		}
		var values = new Lyst<T>();
		switch (resolution) {
			case "days": s.GetLastNDays(count, values); break;
			case "years": s.GetLastNYears(count, values); break;
			default: s.GetLastNMonths(count, values); break;
		}
		json.Arr();
		for (int i = 0; i < values.Count; i++) {
			json.Val(value(values[i]));
		}
		json.EndArr();
	}

	/// <summary>id (also the /api/v1/icons id) and display name of a building type.</summary>
	internal static void WriteProto(Json json, IEntityProto proto) {
		json.Prop("id", proto?.Id.Value).Prop("name", (proto as Proto) is Proto p ? Text(p.Strings.Name) ?? p.Id.Value : proto?.Id.Value);
	}

	/// <summary>Display text, or null when unset or empty (some game strings are empty, e.g. a health category).</summary>
	internal static string Text(LocStr str) => str.IsUnset || string.IsNullOrEmpty(str.TranslatedString) ? null : str.TranslatedString;
}
