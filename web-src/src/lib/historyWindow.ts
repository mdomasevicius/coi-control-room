// Charts on period-switched pages (Food, Settlements, Factory tabs) follow the selected period instead of always
// showing the last 24 months:
//   last / this month -> the last 12 months by month (context around the month)
//   this year         -> this year's months so far
//   last year         -> the 12 months of last year
//   lifetime          -> every year, by year
import { addPeriods, parseGameDate } from '@/logic/api/gameDate'
import type { FlowPeriod, HistoryResponse } from '@/logic/api/types'

export interface HistoryWindow {
  resolution: 'month' | 'year'
  /** Finished periods to request (the API adds the one in progress). */
  count: number
  /** Points to keep from the response: [from, to) (to = undefined: through the end). */
  from: number
  to?: number
  /** Whether the last kept point is the period in progress (shaded). */
  inProgress: boolean
  /** The window itself ("Last 12 months", "Y2846"), used as the chart panel's title. */
  title: string
}

export function historyWindow(period: FlowPeriod, date: string | undefined): HistoryWindow {
  const { year, month } = date ? parseGameDate(date) : { year: 1, month: 1 }
  switch (period) {
    case 'thisYear':
      return { resolution: 'month', count: month - 1, from: 0, inProgress: true, title: `Y${year} so far` }
    case 'lastYear':
      // Months of last year are the first 12 points when asking for (months finished this year + 12).
      return { resolution: 'month', count: month - 1 + 12, from: 0, to: 12, inProgress: false, title: `Y${year - 1}` }
    case 'lifetime':
      return { resolution: 'year', count: Math.max(0, year - 1), from: 0, inProgress: true, title: 'All years' }
    default:
      return { resolution: 'month', count: 12, from: 0, inProgress: true, title: 'Last 12 months' }
  }
}

/** Stable key for refetching: changes only when what to request changes. */
export const windowKey = (w: HistoryWindow) => `${w.resolution}:${w.count}:${w.from}:${w.to ?? ''}`

/** The response cut to the window, with `start` moved to the first kept point. */
export function applyWindow(h: HistoryResponse, w: HistoryWindow): HistoryResponse {
  if (w.from === 0 && w.to === undefined) return h
  const products = Object.fromEntries(
    Object.entries(h.products).map(([id, series]) => [
      id,
      Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v?.slice(w.from, w.to)])),
    ]),
  ) as HistoryResponse['products']
  const d = addPeriods(parseGameDate(h.start), h.resolution, w.from)
  return { ...h, products, start: `${d.year}-${d.month}-${d.day}` }
}

/** "Y15 M3" (month) or "Y15" (year) labels for a history response. */
export function periodLabels(h: HistoryResponse): string[] {
  const n = Math.max(0, ...Object.values(h.products).flatMap((p) => Object.values(p).map((v) => v?.length ?? 0)))
  const start = parseGameDate(h.start)
  return Array.from({ length: n }, (_, i) => {
    const d = addPeriods(start, h.resolution, i)
    return h.resolution === 'year' ? `Y${d.year}` : `Y${d.year} M${d.month}`
  })
}

/**
 * The last 12 finished periods of a windowed series, for a table-row sparkline: the period in progress is left out,
 * because a part-month always reads as a drop at the end of the line.
 */
export const sparkValues = (values: number[], w: HistoryWindow) => (w.inProgress ? values.slice(-13, -1) : values.slice(-12))
