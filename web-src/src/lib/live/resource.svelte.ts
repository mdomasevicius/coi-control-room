import { untrack } from 'svelte'
import type { GameClock } from '@/lib/live/clock.svelte'

/**
 * Data re-fetched whenever the clock's revision or the reactive `params` change.
 * Must be created during component initialisation (it uses $effect).
 *
 * Never runs two requests at once: a change while a request is in flight queues one follow-up with the
 * latest params. `data` keeps the previous value while reloading, so views don't flicker.
 */
export class LiveResource<P, T> {
  data = $state<T | null>(null)
  error = $state<string | null>(null)
  loading = $state(false)
  /** Params the current `data` was fetched with. */
  dataParams = $state<P | undefined>(undefined)

  #inFlight = false
  #latest: P | undefined
  #pending = false

  constructor(
    clock: GameClock,
    params: () => P,
    private fetcher: (params: P, signal: AbortSignal) => Promise<T>,
  ) {
    $effect(() => {
      const revision = clock.revision
      const p = params()
      if (revision > 0) untrack(() => this.#load(p))
    })
  }

  /** Re-fetch now with the latest params (e.g. after sending a command). */
  reload = () => {
    if (this.#latest !== undefined || this.dataParams !== undefined) void this.#load(this.#latest as P)
  }

  async #load(params: P) {
    this.#latest = params
    if (this.#inFlight) {
      this.#pending = true
      return
    }
    this.#inFlight = true
    this.loading = true
    try {
      this.data = await this.fetcher(params, AbortSignal.timeout(10_000))
      this.dataParams = params
      this.error = null
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      this.#inFlight = false
      this.loading = false
      if (this.#pending) {
        this.#pending = false
        void this.#load(this.#latest as P)
      }
    }
  }
}
