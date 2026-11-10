import type { ChartSeries } from '@/components/Chart/Chart.svelte'
import { catColor } from '@/lib/food'

/** Most series a chart draws on its own; there are only six categorical colors. */
export const MAX_SERIES = 6

/**
 * Series for a chart of many products or categories: the largest (by total over the chart) are drawn on their own,
 * the rest summed into one muted "Other (N)" series, so no two lines share a color. The kept series stay in the
 * caller's order (a fixed list per page) and take the categorical slots in that order, so a series keeps its color
 * when the period changes, as long as it stays among the largest; color never follows rank.
 * A single series takes `single` (the flow's own color).
 */
export function topSeries(rows: { label: string; values: (number | null)[] }[], single: string): ChartSeries[] {
  if (rows.length === 1) return [{ ...rows[0], color: single }]
  const total = (v: (number | null)[]) => v.reduce<number>((a, x) => a + (x ?? 0), 0)
  const ranked = [...rows].sort((a, b) => total(b.values) - total(a.values))
  const kept = new Set(ranked.length > MAX_SERIES ? ranked.slice(0, MAX_SERIES - 1) : ranked)
  const series: ChartSeries[] = rows.filter((r) => kept.has(r)).map((r, i) => ({ ...r, color: catColor(i) }))
  const rest = rows.filter((r) => !kept.has(r))
  if (rest.length) {
    const n = Math.max(...rest.map((r) => r.values.length))
    const values = Array.from({ length: n }, (_, m) => rest.reduce((a, r) => a + (r.values[m] ?? 0), 0))
    series.push({ label: `Other (${rest.length})`, values, color: '--muted' })
  }
  return series
}

/** The color a label got in `series` ('--muted' when it went into "Other"), for swatches next to the chart. */
export const colorIn = (series: ChartSeries[] | undefined, label: string) => series?.find((s) => s.label === label)?.color ?? '--muted'
