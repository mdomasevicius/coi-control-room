// Shared helpers for the Factory tabs built on the stats series breakdown: construction & upkeep, waste & dumping,
// mining & fuel. Each picks the products with a non-zero lifetime value in its series, charts their monthly
// history and lists the buildings that `sources` names for them.
import { topSeries } from '@/lib/topSeries'
import { addPeriods, DAYS_PER_MONTH, MONTHS_PER_YEAR, parseGameDate } from '@/logic/api/gameDate'
import type { ChartSeries } from '@/components/Chart/Chart.svelte'
import type { FlowPeriod, FlowSeries, HistoryResponse, ProductStats, SourcesResponse } from '@/logic/api/types'

const lifetime = (s: ProductStats | undefined, key: FlowSeries) => s?.[key]?.[4] ?? 0

/** Products with a non-zero lifetime value in `key`, largest first. */
export function activeIds(stats: Record<string, ProductStats> | null, key: FlowSeries): string[] {
  if (!stats) return []
  return Object.keys(stats)
    .filter((id) => lifetime(stats[id], key) > 0)
    .sort((a, b) => lifetime(stats[b], key) - lifetime(stats[a], key))
}

/** "Y15 M3" labels for a month history response. */
export function monthLabels(h: HistoryResponse): string[] {
  const n = Math.max(0, ...Object.values(h.products).flatMap((p) => Object.values(p).map((v) => v?.length ?? 0)))
  const start = parseGameDate(h.start)
  return Array.from({ length: n }, (_, i) => {
    const d = addPeriods(start, 'month', i)
    return `Y${d.year} M${d.month}`
  })
}

/**
 * How many months a flow period spans on `date` ("Y-M-D"), counting the days elapsed in periods in progress, so a
 * period's total can be turned into a monthly rate. Lifetime counts from the game's first day, 1-1-1.
 */
export function periodMonths(period: FlowPeriod, date: string | undefined): number | null {
  if (period === 'lastMonth') return 1
  if (period === 'lastYear') return MONTHS_PER_YEAR
  if (!date) return null
  const d = parseGameDate(date)
  const inMonth = d.day / DAYS_PER_MONTH
  if (period === 'thisMonth') return inMonth
  if (period === 'thisYear') return d.month - 1 + inMonth
  return (d.year - 1) * MONTHS_PER_YEAR + d.month - 1 + inMonth
}

/** Months `stock` lasts when `used` goes in `months`; null when nothing is used. */
export function lastsMonths(stock: number | undefined, used: number, months: number | null): number | null {
  if (!used || !months) return null
  return (stock ?? 0) / (used / months)
}

export const formatMonths = (m: number | null) =>
  m === null ? '–' : m < 1 ? `${Math.round(m * DAYS_PER_MONTH)} days` : m >= 100 ? `${Math.round(m)} mo` : `${m.toFixed(1)} mo`

/** A building named in `sources`: a machine running a recipe, or an entity (excavator, oil pump, …). */
export interface Handler {
  /** Machine or entity id (also the icon id). */
  id: string
  name: string
  /** Recipe display name ("A + B → C") for machine rows. */
  recipe?: string
  quantity: number
}

/**
 * The buildings in `sources` on one side of a product, merged per machine/entity (recipes of one machine are
 * kept apart, since they read differently). Rows without a building (fuel, construction, import) are skipped.
 */
export function handlers(
  src: SourcesResponse | null,
  id: string,
  side: 'produced' | 'consumed',
  keep: (h: Handler) => boolean = () => true,
): Handler[] {
  const rows = src?.products[id]?.[side].rows ?? []
  const out = new Map<string, Handler>()
  for (const row of rows) {
    let h: Handler | null = null
    if (row.type === 'recipe' && 'recipe' in row)
      h = { id: row.machine, name: src!.names[row.machine] ?? row.machine, recipe: src!.names[row.recipe] ?? row.recipe, quantity: row.quantity }
    else if (row.type === 'entity' && 'entity' in row)
      h = { id: row.entity, name: src!.names[row.entity] ?? row.entity, quantity: row.quantity }
    if (!h || h.quantity <= 0 || !keep(h)) continue
    const key = `${h.id}|${h.recipe ?? ''}`
    const prev = out.get(key)
    if (prev) prev.quantity += h.quantity
    else out.set(key, h)
  }
  return [...out.values()].sort((a, b) => b.quantity - a.quantity)
}

/**
 * Unique buildings from handler lists, in first-seen order, merged by display name: the game has variants that share
 * a name (Mega excavator is ExcavatorT3 and ExcavatorT3H). `id` is the first variant seen (for the icon), `ids` all.
 */
export function uniqueBuildings(lists: Handler[][]): { id: string; ids: string[]; name: string }[] {
  const seen = new Map<string, { id: string; ids: string[]; name: string }>()
  for (const list of lists)
    for (const h of list) {
      const b = seen.get(h.name)
      if (!b) seen.set(h.name, { id: h.id, ids: [h.id], name: h.name })
      else if (!b.ids.includes(h.id)) b.ids.push(h.id)
    }
  return [...seen.values()]
}

/** A month history series, zeros when the product has none. */
export function historyOf(h: HistoryResponse, id: string, key: FlowSeries): number[] {
  return h.products[id]?.[key] ?? Array(monthLabels(h).length).fill(0)
}

/** One chart series per product, the largest six on their own and the rest as "Other" (see topSeries). */
export function stackSeries(
  h: HistoryResponse,
  ids: string[],
  key: FlowSeries,
  single: '--series-produced' | '--series-consumed',
  name: (id: string) => string,
): ChartSeries[] {
  return topSeries(ids.map((id) => ({ label: name(id), values: historyOf(h, id, key) })), single)
}

/** Whether any series has a non-zero month (all-zero charts are left out). */
export const hasData = (series: ChartSeries[]) => series.some((s) => s.values.some((v) => (v ?? 0) > 0))
