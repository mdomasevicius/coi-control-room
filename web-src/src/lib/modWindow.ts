// Shared bits for pages fed by the ControlRoom mod's routes (Power, Settlements health): its period set, the chart
// window each period shows, and the "mod missing" error. Mod history series start with the newest *completed*
// period, unlike /api/v1 history (oldest first, then the one in progress).
import { ApiError } from '@/logic/api/client'
import { addPeriods, parseGameDate } from '@/logic/api/gameDate'
import type { FlowPeriod, UnityPeriod, UnityResolution } from '@/logic/api/types'

/**
 * The game's mod-side stats have no "this month"; pages build it from this month's finished days (`thisMonthDays`).
 * Finished days of the current month for a game date "Y-M-D" (day 1: none yet).
 */
export const thisMonthDays = (date: string | undefined) => (date ? Math.max(0, parseGameDate(date).day - 1) : 0)

/** Mean of a newest-first daily series' first `n` days. */
export const meanOf = (values: number[] | null | undefined, n: number) => {
  const v = (values ?? []).slice(0, n)
  return v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0
}

/** A period value from a mod stats object; this month comes from daily values instead. */
export type { UnityPeriod }

export interface ModWindow {
  resolution: UnityResolution
  /** Newest completed periods to skip (last year skips this year's finished months). */
  skip: number
  take: number
  /** Panel title for the window. */
  title: string
  /** Labels oldest first, one per kept period. */
  labels: string[]
}

/**
 * The chart window a period shows: the last 12 months (last or this month), this year's months, last year's 12
 * months, or every year for lifetime.
 */
export function modWindow(period: FlowPeriod, date: string | undefined): ModWindow | null {
  if (!date) return null
  const today = parseGameDate(date)
  const monthStart = { year: today.year, month: today.month, day: 1 }
  const monthLabel = (back: number) => {
    const d = addPeriods(monthStart, 'month', -(back + 1))
    return `Y${d.year} M${d.month}`
  }
  const build = (resolution: UnityResolution, skip: number, take: number, title: string, label: (back: number) => string) => ({
    resolution,
    skip,
    take,
    title,
    labels: Array.from({ length: take }, (_, k) => label(skip + take - 1 - k)),
  })
  if (period === 'lifetime' && today.year > 1) {
    return build('years', 0, Math.min(1000, today.year - 1), 'All years', (back) => `Y${today.year - 1 - back}`)
  }
  if (period === 'lastYear') return build('months', today.month - 1, 12, `Y${today.year - 1}`, monthLabel)
  if (period === 'thisYear' && today.month > 1) return build('months', 0, today.month - 1, `Y${today.year} so far`, monthLabel)
  return build('months', 0, 12, 'Last 12 months', monthLabel)
}

/** How many periods to request for a window. */
export const windowCount = (w: ModWindow) => Math.min(1000, w.skip + w.take)

/** A newest-first mod series cut to the window, oldest first (padded with zeros where the game has no data). */
export function windowed(values: number[] | null | undefined, w: ModWindow): number[] {
  const kept = (values ?? []).slice(w.skip, w.skip + w.take).reverse()
  return [...Array(Math.max(0, w.take - kept.length)).fill(0), ...kept]
}

/** The last 12 completed months of a newest-first series, oldest first, for sparklines. */
export const lastMonths = (values: number[] | null | undefined) => [...(values ?? []).slice(0, 12)].reverse()

export function modMissing(what: string) {
  return `${what} comes from the Control Room mod, which this game hasn't loaded (or loaded in an older version). Install it (make deploy) and restart the game.`
}

/** Runs a mod request, turning its 404 (mod not loaded) into a readable error. */
export async function fromMod<T>(what: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (e) {
    throw e instanceof ApiError && e.status === 404 ? new Error(modMissing(what)) : e
  }
}

/** Mod request for an optional card: null when the mod (or route) isn't there. */
export async function optionalMod<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load()
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

// ---- units ----
const one = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

/** Electricity in kW (the game's unit) as kW / MW / GW. */
export function formatPower(kw: number | null | undefined): string {
  if (kw === null || kw === undefined) return '–'
  if (kw === 0) return '0'
  const a = Math.abs(kw)
  if (a >= 1_000_000) return `${one.format(kw / 1_000_000)} GW`
  if (a >= 1000) return `${one.format(kw / 1000)} MW`
  return `${Math.round(kw)} kW`
}

const two = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

/** Computing: the game's raw value is TFLOPS; like its own UI, 8232 reads "8.23 PF". */
export function formatComputing(tf: number | null | undefined): string {
  if (tf === null || tf === undefined) return '–'
  if (tf === 0) return '0'
  const a = Math.abs(tf)
  if (a >= 1_000_000) return `${two.format(tf / 1_000_000)} EF`
  if (a >= 1000) return `${two.format(tf / 1000)} PF`
  return `${one.format(tf)} TF`
}

/**
 * A grid's surplus right now: capacity minus what is used (the larger of consumption and demand). In computing the
 * data centers always "produce" their full capacity, so use is the demand (the game's "Consumption" line).
 */
export function gridSurplus(used: number, capacity: number) {
  const surplus = capacity - used
  return { surplus, share: capacity > 0 ? surplus / capacity : null, low: capacity > 0 && surplus / capacity < 0.1 }
}
