// Types for the Captain of Industry web API (v1). There are no official docs; these are derived from
// GET /routes, the responses and /demo-dashboard. See docs/api.md.

/** Game date "Y-M-D". A month has 30 days, a year 12 months. */
export type GameDateString = string

/** Every v1 response carries the game date and tick it was produced at. */
export interface Stamped {
  date: GameDateString
  tick: number
}

export interface GameInfo extends Stamped {
  isPaused: boolean
  speed: number
  /** Stable for a playthrough. */
  gameId: string
  /** Changes on every start or load. Use it to invalidate caches (and as icon cache buster). */
  sessionId: string
}

export type OtherOrigins = 'none' | 'get' | 'getAndPost'

export interface ServerInfo extends Stamped {
  port: number
  otherOrigins: OtherOrigins
}

export type ProductKind = 'countable' | 'loose' | 'fluid' | 'molten' | 'virtual' | (string & {})

export interface Product {
  id: string
  name: string
  kind: ProductKind
  isUnlocked: boolean
}

export interface ProductsResponse extends Stamped {
  products: Product[]
  unknownIds: string[]
}

export const LEVEL_SERIES = ['quantity', 'stored', 'storageCapacity'] as const

export const FLOW_SERIES = [
  'produced',
  'producedByBuildings',
  'producedByMining',
  'producedByRecycling',
  'producedByResearch',
  'producedBySettlements',
  'producedByImport',
  'producedByDeconstruction',
  'consumed',
  'consumedByConstruction',
  'consumedByMaintenance',
  'consumedBySettlements',
  'consumedByResearch',
  'consumedByFarms',
  'consumedByExport',
  'consumedAsFuel',
  'dumped',
] as const

export type LevelSeries = (typeof LEVEL_SERIES)[number]
export type FlowSeries = (typeof FLOW_SERIES)[number]
export type Series = LevelSeries | FlowSeries

/** Flow values: [thisMonth, lastMonth, thisYear, lastYear, lifetime]. */
export type Flow = [number, number, number, number, number]

export const FLOW_INDEX = { thisMonth: 0, lastMonth: 1, thisYear: 2, lastYear: 3, lifetime: 4 } as const
export type FlowPeriod = keyof typeof FLOW_INDEX

export type ProductStats = Partial<Record<LevelSeries, number> & Record<FlowSeries, Flow>>

export interface StatsResponse extends Stamped {
  products: Record<string, ProductStats>
  unknownIds: string[]
}

export type Resolution = 'day' | 'month' | 'year' | 'quarterCentury'

export interface HistoryResponse extends Stamped {
  resolution: Resolution
  /** First day of the oldest period. */
  start: GameDateString
  /** Per product, per series: finished periods oldest first, then the period in progress. */
  products: Record<string, Partial<Record<Series, number[]>>>
  unknownIds: string[]
}

export type SourcesPeriod = FlowPeriod

export type SourceRow =
  | { type: 'recipe'; quantity: number; recipe: string; machine: string }
  | { type: 'entity'; quantity: number; entity: string }
  | { type: 'import' | 'fuel' | 'export' | 'construction' | 'unknown' | (string & {}); quantity: number }

export interface SourceSide {
  total: number
  rows: SourceRow[]
}

export interface SourcesResponse extends Stamped {
  period: SourcesPeriod
  products: Record<string, { produced: SourceSide; consumed: SourceSide }>
  /** Display names for recipe / machine / entity ids used in rows. */
  names: Record<string, string>
  unknownIds: string[]
}

export interface CommandResult {
  ok: boolean
  result: unknown
  error: string
  processedAtStep: number
}

export interface CommandParam {
  name: string
  type: string
  json?: string
  default?: unknown
  description?: string
}

export interface CommandInfo {
  type: string
  namespace: string
  description: string
  result: string
  constructors: { params: CommandParam[] }[]
}

export interface RouteInfo {
  method: 'GET' | 'POST'
  path: string
  stage: string
  description: string
  params: { name: string; type: string; from: 'path' | 'query'; default?: unknown; description?: string }[]
}

export interface ApiErrorBody {
  error: string
  message: string
  parameter?: string
}

// ---- ControlRoom mod: Unity (/api/mods/control-room/unity) ----

/** Unity per period. The game's stats have no "this month" per category. */
export interface UnityPeriods {
  lastDay: number
  lastMonth: number
  thisYear: number
  lastYear: number
  lifetime: number
}
export type UnityPeriod = Exclude<keyof UnityPeriods, 'lastDay'>

export interface UnityCategoryInfo {
  id: string
  name: string
  icon: string | null
  oneTimeAction: boolean
  ignoreInStats: boolean
  hidden: boolean
}

export interface UnityCategory extends UnityCategoryInfo {
  generated: UnityPeriods | null
  consumed: UnityPeriods | null
}

/** One line of this month's Unity ledger, like the game's Unity tooltip. Negative `exchanged` = spent. */
export interface UnityRecord {
  category: string
  statsCategory: string | null
  title: string | null
  /** Id of the product, building or edict the line names (for /api/v1/icons/{id}); null when nothing matches. */
  icon: string | null
  exchanged: number
  max: number
  possibleMax: number
}

export interface UnityResponse {
  quantity: number
  cap: number
  lastMonth: { net: number; possibleNet: number; netWithOneTimeActions: number }
  categories: UnityCategory[]
  thisMonth: UnityRecord[]
}

export type UnityResolution = 'days' | 'months' | 'years'

/** Series start with the newest *completed* period. */
export interface UnityHistoryResponse {
  resolution: UnityResolution
  count: number
  categories: (UnityCategoryInfo & { generated: number[] | null; consumed: number[] | null })[]
}

// ---- ControlRoom mod: electricity, computing (/api/mods/control-room/electricity, /computing) ----

/** A building type in a power or computing breakdown; `id` is also the icon id. */
export interface ModProto {
  id: string
  name: string
}

/** Period averages of a rate (kW, TFLOPS) or health points. */
export type ModPeriods = UnityPeriods

export interface PowerProducer extends ModProto {
  count: number
  /** Right now. */
  produced: number
  wasted?: number
  maxCapacity?: number
  average: ModPeriods | null
}

export interface PowerConsumer extends ModProto {
  count: number
  consumed: number
  demanded: number
  max: number
  average: ModPeriods | null
}

export interface ElectricityResponse {
  /** Right now, in kW. */
  now: {
    generated: number
    consumed: number
    demanded: number
    surplusDemanded: number
    capacity: number
    maxCapacity: number
    wasted: number
    /** The game's own formatting of `generated`, e.g. "12.4 MW". */
    generatedText: string
  }
  generatorCount: number
  consumerCount: number
  ignoreMissing: boolean
  freeGrace: boolean
  production: ModPeriods
  consumption: ModPeriods
  capacity: ModPeriods
  producers: PowerProducer[]
  consumers: PowerConsumer[]
}

export interface ComputingResponse {
  now: { produced: number; demanded: number; capacity: number; producedText: string }
  ignoreMissing: boolean
  freeGrace: boolean
  production: ModPeriods
  demand: ModPeriods
  capacity: ModPeriods
  producers: PowerProducer[]
  consumers: PowerConsumer[]
}

/** Series start with the newest *completed* period. */
export interface PowerHistoryResponse {
  resolution: UnityResolution
  count: number
  production: number[]
  /** Electricity: consumption. */
  consumption?: number[]
  /** Computing: demand. */
  demand?: number[]
  capacity: number[]
  producers: (ModProto & { values: number[] | null })[]
  consumers: (ModProto & { values: number[] | null })[]
}

// ---- ControlRoom mod: population and health (/api/mods/control-room/population) ----

export interface SettlementNeed {
  id: string
  name: string
  food: boolean
  healthcare: boolean
  /** Percent, 0-100. */
  satisfiedLastMonth: number
  satisfiedNow: number
  unity: number
  unityMax: number
}

export interface SettlementInfo {
  /** Settlements have no id or name in the game; numbered in the game's order from 1. */
  index: number
  population: number
  housing: number
  freeHousing: number
  starving: boolean
  starvedLastMonth: number
  monthsOfFood: number
  hasFoodModule: boolean
  /** Percent. */
  healthFromFood: number
  foodCategoriesWithHealth: number
  healthCategoriesTotal: number
  hospitals: number
  landfill: number
  landfillLimit: number
  /** Percent. */
  healthPenaltyFromWaste: number
  needs: SettlementNeed[]
}

/** One line of what changed health (or the birth rate) last month. `change` in percentage points. */
export interface PopRecord {
  category: string
  name: string
  change: number
  max: number
}

export interface PopulationResponse {
  population?: number
  populationChange?: number
  housing?: number
  freeHousing?: number
  homeless?: number
  starving?: boolean
  starvedLastMonth?: number
  monthsOfFood?: number
  /** Percent. */
  researchBonus?: number
  settlements?: SettlementInfo[]
  workers?: { free: number; freeOrMissing: number; withheld: number; needed: ModPeriods }
  health?: {
    /** Percent. */
    thisMonth: number
    lastMonth: number
    min: number
    unityLastMonth: number
    generated: ModPeriods
    consumed: ModPeriods
    lastMonthRecords: PopRecord[]
    categories: (ModProto & { generated: ModPeriods | null; consumed: ModPeriods | null })[]
  }
  disease?: { id: string; name: string; monthsLeft: number; mortality: number } | null
  births?: {
    rateThisMonth: number
    rateLastMonth: number
    growthPaused: boolean
    born: { lastMonth: number; thisYear: number; lastYear: number; lifetime: number }
    lost: { lastMonth: number; thisYear: number; lastYear: number; lifetime: number }
    lastMonthRecords: PopRecord[]
  }
}

/** Series start with the newest *completed* period. */
export interface PopulationHistoryResponse {
  resolution: UnityResolution
  count: number
  generated: number[]
  consumed: number[]
  born: number[]
  lost: number[]
  categories: (ModProto & { generated: number[] | null; consumed: number[] | null })[]
}
