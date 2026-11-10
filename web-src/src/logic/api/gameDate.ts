// Game calendar: 30 days per month, 12 months per year. Dates are "Y-M-D" strings (1-based month/day).
import type { GameDateString, Resolution } from '@/logic/api/types'

export const DAYS_PER_MONTH = 30
export const MONTHS_PER_YEAR = 12
export const YEARS_PER_QUARTER_CENTURY = 25

export interface GameDate {
  year: number
  month: number
  day: number
}

export function parseGameDate(text: GameDateString): GameDate {
  const [year, month, day] = text.split('-').map(Number)
  return { year, month, day }
}

export function formatGameDate(d: GameDate): string {
  return `Y${d.year} M${d.month} D${d.day}`
}

/** First day of the period `periods` steps after `start` (used to label history arrays). */
export function addPeriods(start: GameDate, resolution: Resolution, periods: number): GameDate {
  if (resolution === 'day') {
    const days = (start.year * MONTHS_PER_YEAR + start.month - 1) * DAYS_PER_MONTH + start.day - 1 + periods
    const months = Math.floor(days / DAYS_PER_MONTH)
    return {
      year: Math.floor(months / MONTHS_PER_YEAR),
      month: (months % MONTHS_PER_YEAR) + 1,
      day: (days % DAYS_PER_MONTH) + 1,
    }
  }
  if (resolution === 'month') {
    const months = start.year * MONTHS_PER_YEAR + start.month - 1 + periods
    return { year: Math.floor(months / MONTHS_PER_YEAR), month: (months % MONTHS_PER_YEAR) + 1, day: 1 }
  }
  const years = resolution === 'quarterCentury' ? periods * YEARS_PER_QUARTER_CENTURY : periods
  return { year: start.year + years, month: 1, day: 1 }
}
