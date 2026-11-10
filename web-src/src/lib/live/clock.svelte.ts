import { api } from '@/logic/api/client'
import type { GameInfo } from '@/logic/api/types'

/**
 * Polls /api/v1/game-info, the only cheap "has anything changed?" signal the API has.
 *
 * `revision` increments whenever dependent data may be stale:
 *  - the tick advanced (a running game: same tick means same data),
 *  - the game is paused (input commands can still change things),
 *  - a different save was loaded (sessionId changed).
 * Views re-fetch their data when `revision` changes instead of polling on their own timers.
 */
export class GameClock {
  info = $state<GameInfo | null>(null)
  error = $state<string | null>(null)
  /** ms timestamp of the last successful poll. */
  lastOkAt = $state(0)
  revision = $state(0)
  readonly connected = $derived(this.error === null && this.info !== null)

  #timer: ReturnType<typeof setTimeout> | undefined
  #running = false
  #lastTick = -1
  #sessionId = ''

  constructor(public intervalMs = 2000) {}

  start() {
    if (this.#running) return
    this.#running = true
    document.addEventListener('visibilitychange', this.#onVisibility)
    void this.#loop()
  }

  stop() {
    this.#running = false
    clearTimeout(this.#timer)
    document.removeEventListener('visibilitychange', this.#onVisibility)
  }

  /** Poll right away, e.g. after sending a command. */
  refresh = () => {
    clearTimeout(this.#timer)
    void this.#loop()
  }

  #onVisibility = () => {
    if (document.visibilityState === 'visible') this.refresh()
  }

  async #loop() {
    if (!this.#running) return
    // Don't hammer the game from a background tab.
    if (document.visibilityState !== 'hidden') await this.#poll()
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => void this.#loop(), this.intervalMs)
  }

  async #poll() {
    try {
      const info = await api.gameInfo(AbortSignal.timeout(this.intervalMs * 2))
      const changed =
        info.sessionId !== this.#sessionId || info.tick !== this.#lastTick || info.isPaused || this.error !== null
      this.#sessionId = info.sessionId
      this.#lastTick = info.tick
      this.info = info
      this.error = null
      this.lastOkAt = Date.now()
      if (changed) this.revision++
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    }
  }
}
