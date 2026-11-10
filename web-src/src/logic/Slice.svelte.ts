/**
 * How often a slice can change, which decides when the poller fetches it again:
 * - `tick`: whenever the simulation tick advances, and on every sweep while paused (input commands can still
 *   change state without advancing the tick),
 * - `day` / `month`: once per game day / game month,
 * - `session`: once per loaded save (sessionId).
 */
export type Cadence = 'tick' | 'day' | 'month' | 'session'

export type Fetcher<T> = (signal: AbortSignal) => Promise<T>

/**
 * One endpoint's data held in memory by the poller.
 *
 * `data` is `$state.raw`: every load replaces the whole response, so there is no point in deep proxies over
 * tens of KB of JSON. Consumers read it through `$derived`.
 *
 * A failed load keeps the last good `data` and sets `error`; the slice stays due and is retried next sweep.
 */
export class Slice<T> {
  data = $state.raw<T | null>(null)
  error = $state<string | null>(null)
  /** ms timestamp (wall clock) of the last successful load; 0 = never. */
  updatedAt = $state(0)
  loading = $state(false)

  /** Key of the data currently held; the poller loads again when the wanted key differs. */
  #key: string | null = null

  constructor(
    readonly name: string,
    readonly cadence: Cadence,
    readonly fetch: Fetcher<T>,
  ) {}

  isDue(key: string): boolean {
    return key !== this.#key
  }

  async load(key: string, signal: AbortSignal): Promise<void> {
    this.loading = true
    try {
      const data = await this.fetch(signal)
      this.data = data
      this.error = null
      this.updatedAt = Date.now()
      this.#key = key
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      this.loading = false
    }
  }

  /** Fetch again on the next sweep, keeping the current data until then. */
  invalidate(): void {
    this.#key = null
  }

  /** Drop everything, e.g. when another save was loaded. */
  reset(): void {
    this.data = null
    this.error = null
    this.updatedAt = 0
    this.#key = null
  }
}
