import { DAYS_PER_MONTH, MONTHS_PER_YEAR, parseGameDate } from '@/logic/api/gameDate'
import type { GameDateString, GameInfo } from '@/logic/api/types'

/** Rolling measurement window. */
const WINDOW_MS = 45_000
/** Minimum span of samples before a fresh rate is trusted. */
const MIN_SPAN_MS = 8_000
/** A gap this long between polls (hidden tab, offline) may hide a pause: start over. */
const MAX_GAP_MS = 10_000

interface Sample {
  at: number
  tick: number
  day: number
}

/** Days since 1-1-1 (the first day is 0). */
function dayNumber(date: GameDateString) {
  const d = parseGameDate(date)
  return ((d.year - 1) * MONTHS_PER_YEAR + d.month - 1) * DAYS_PER_MONTH + d.day - 1
}

/**
 * How fast game time passes in real time, measured from the GameClock's polls: game days per real second at the
 * current speed setting. The rate comes from ticks (fine-grained) divided by ticks per game day, which is learned
 * from the date. The last measured rate is remembered per speed, so switching back to a speed shows estimates
 * right away. Nothing is reported while paused or offline.
 */
class GameSpeed {
  /** Game days per real second at the current speed, or null (not measured yet, paused, offline). */
  daysPerSecond = $state<number | null>(null)
  /** The speed setting the rate belongs to. */
  speed = $state<number | null>(null)

  #samples: Sample[] = []
  #bySpeed = new Map<number, number>()
  #ticksPerDay: number | null = null
  #sessionId = ''
  #lastSpeed = -1

  feed(info: GameInfo | null, connected: boolean, now = performance.now()) {
    if (!info || !connected) {
      this.#samples = []
      this.daysPerSecond = null
      return
    }
    if (info.sessionId !== this.#sessionId) {
      this.#sessionId = info.sessionId
      this.#bySpeed.clear()
      this.#ticksPerDay = null
      this.#samples = []
    }
    this.speed = info.speed
    if (info.isPaused) {
      this.#samples = []
      this.daysPerSecond = null
      return
    }
    if (info.speed !== this.#lastSpeed) {
      this.#lastSpeed = info.speed
      this.#samples = []
    }

    const sample = { at: now, tick: info.tick, day: dayNumber(info.date) }
    const prev = this.#samples.at(-1)
    if (prev && (now - prev.at > MAX_GAP_MS || sample.tick < prev.tick)) this.#samples = []
    this.#samples.push(sample)
    while (this.#samples.length > 2 && now - this.#samples[0].at > WINDOW_MS) this.#samples.shift()

    this.#learnTicksPerDay(sample)
    const first = this.#samples[0]
    const span = now - first.at
    if (this.#ticksPerDay && span >= MIN_SPAN_MS && sample.tick > first.tick) {
      const rate = (sample.tick - first.tick) / this.#ticksPerDay / (span / 1000)
      this.#bySpeed.set(info.speed, rate)
    }
    this.daysPerSecond = this.#bySpeed.get(info.speed) ?? null
  }

  #learnTicksPerDay(s: Sample) {
    // Over a long run of days, Δtick / Δday is exact enough. Before that, assume the game started at tick 0 on
    // day 1 (true for normal saves); the in-day offset is negligible after a few months.
    const first = this.#samples[0]
    if (s.day - first.day >= 10) this.#ticksPerDay = (s.tick - first.tick) / (s.day - first.day)
    else if (this.#ticksPerDay === null && s.day >= 30) this.#ticksPerDay = s.tick / (s.day + 0.5)
  }

  /** Real time `gameMonths` take at the measured rate, e.g. "about 40 min"; null while unknown. */
  realDuration(gameMonths: number): string | null {
    if (!this.daysPerSecond || !Number.isFinite(gameMonths) || gameMonths <= 0) return null
    return formatDuration((gameMonths * DAYS_PER_MONTH) / this.daysPerSecond)
  }

  /** Like realDuration plus the speed, e.g. "about 40 min at 3×". */
  realDurationAtSpeed(gameMonths: number): string | null {
    const d = this.realDuration(gameMonths)
    return d && this.speed ? `${d} at ${this.speed}×` : d
  }
}

function formatDuration(seconds: number): string {
  const min = seconds / 60
  if (min < 1) return 'under a minute'
  if (min < 59.5) return `about ${Math.round(min)} min`
  const h = min / 60
  if (h < 10) return `about ${Math.round(h * 2) / 2} h`
  if (h < 48) return `about ${Math.round(h)} h`
  return `about ${Math.round(h / 24)} days`
}

export const gameSpeed = new GameSpeed()
