import { api } from '@/logic/api/client'
import { parseGameDate, type GameDate } from '@/logic/api/gameDate'
import {
  FLOW_SERIES,
  LEVEL_SERIES,
  type CommandInfo,
  type CommandResult,
  type GameInfo,
  type HistoryResponse,
  type Product,
  type ProductStats,
  type Resolution,
  type Series,
  type ServerInfo,
  type SourcesPeriod,
  type SourcesResponse,
} from '@/logic/api/types'
import { Slice, type Cadence } from '@/logic/Slice.svelte'

/** Every series stats knows about (~22 KB for all unlocked products). */
const ALL_SERIES: Series[] = [...LEVEL_SERIES, ...FLOW_SERIES]
/** History has no `storageCapacity`, and `day` resolution only has the two levels (flows are monthly). */
const HISTORY_SERIES: Series[] = ALL_SERIES.filter((s) => s !== 'storageCapacity')
const DAY_SERIES: Series[] = ['quantity', 'stored']

export const RESOLUTIONS = ['day', 'month', 'year', 'quarterCentury'] as const satisfies readonly Resolution[]
export const PERIODS = ['thisMonth', 'lastMonth', 'thisYear', 'lastYear', 'lifetime'] as const satisfies readonly SourcesPeriod[]

/** Finished periods requested per resolution (the response adds the period in progress). */
const HISTORY_COUNT: Record<Resolution, number> = { day: 30, month: 24, year: 20, quarterCentury: 8 }

/** Finished periods only change when the month turns; the others are still accumulating. */
const SOURCES_CADENCE: Record<SourcesPeriod, Cadence> = {
  thisMonth: 'day',
  lastMonth: 'month',
  thisYear: 'day',
  lastYear: 'month',
  lifetime: 'day',
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
const isAbort = (e: unknown) => e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError')

export interface GameStoreOptions {
  /** Pause between the end of one sweep and the start of the next. */
  intervalMs?: number
  /** A sweep that takes longer than this is aborted. */
  timeoutMs?: number
}

/**
 * The single poller and in-memory copy of everything the game API exposes.
 *
 * Each sweep fetches `game-info`, then every slice whose cadence key changed (see {@link Cadence}), all in
 * parallel. Sweeps never overlap: the next one is scheduled after the previous finished. A failing slice keeps
 * its last good data and doesn't affect the others. A new `sessionId` (another save loaded) drops all data.
 *
 * The game answers queued requests once per frame (~30 ms each, parallel ones together), and only changed
 * slices are fetched, so a running game costs ~25 KB per second plus ~130 KB per game day.
 *
 * Create one, call `start()`, put it in context (`setGameStore`), read `$state` fields from components.
 */
export class GameStore {
  // --- connection -------------------------------------------------------------------------------------------
  info = $state.raw<GameInfo | null>(null)
  /** Error of the last game-info request; non-null means the game isn't answering. */
  error = $state<string | null>(null)
  /** ms timestamp of the last successful game-info. */
  lastOkAt = $state(0)
  /** Increments after every sweep that loaded something. Handy for "last updated" displays and tests. */
  sweeps = $state(0)

  readonly connected = $derived(this.info !== null && this.error === null)
  readonly date: GameDate | null = $derived(this.info ? parseGameDate(this.info.date) : null)
  readonly sessionId = $derived(this.info?.sessionId ?? '')

  // --- slices -----------------------------------------------------------------------------------------------
  readonly server = new Slice<ServerInfo>('server', 'session', (s) => api.serverInfo(s))
  /** Every product including locked ones; refetched monthly because research unlocks products. */
  readonly catalog = new Slice<Product[]>('catalog', 'month', async (s) =>
    (await api.products({ includeLocked: true }, s)).products,
  )
  /** In-game pinned product ids, in the player's order. */
  readonly pinned = new Slice<string[]>('pinned', 'tick', async (s) =>
    (await api.products({ pinned: true }, s)).products.map((p) => p.id),
  )
  /** All series for all unlocked products. */
  readonly stats = new Slice<Record<string, ProductStats>>('stats', 'tick', async (s) =>
    (await api.stats({ series: ALL_SERIES }, s)).products,
  )
  readonly history: Record<Resolution, Slice<HistoryResponse>> = Object.fromEntries(
    RESOLUTIONS.map((resolution) => [
      resolution,
      new Slice<HistoryResponse>(`history:${resolution}`, 'day', (s) =>
        api.history(
          {
            resolution,
            count: HISTORY_COUNT[resolution],
            series: resolution === 'day' ? DAY_SERIES : HISTORY_SERIES,
          },
          s,
        ),
      ),
    ]),
  ) as Record<Resolution, Slice<HistoryResponse>>
  readonly sources: Record<SourcesPeriod, Slice<SourcesResponse>> = Object.fromEntries(
    PERIODS.map((period) => [
      period,
      new Slice<SourcesResponse>(`sources:${period}`, SOURCES_CADENCE[period], (s) => api.sources({ period }, s)),
    ]),
  ) as Record<SourcesPeriod, Slice<SourcesResponse>>
  /** Input commands the game accepts (~60 KB); they only change with mods, so once per session. */
  readonly commands = new Slice<CommandInfo[]>('commands', 'session', (s) => api.commands(undefined, s))

  readonly slices: readonly Slice<unknown>[] = [
    this.server,
    this.catalog,
    this.pinned,
    this.stats,
    ...Object.values(this.history),
    ...Object.values(this.sources),
    this.commands,
  ]

  // --- derived views of the data ----------------------------------------------------------------------------
  readonly productById: ReadonlyMap<string, Product> = $derived(new Map((this.catalog.data ?? []).map((p) => [p.id, p])))
  /** Unlocked products, sorted by name (the API's order). */
  readonly products: readonly Product[] = $derived((this.catalog.data ?? []).filter((p) => p.isUnlocked))
  readonly pinnedIds: readonly string[] = $derived(this.pinned.data ?? [])
  readonly pinnedSet: ReadonlySet<string> = $derived(new Set(this.pinnedIds))

  // --- loop -------------------------------------------------------------------------------------------------
  readonly intervalMs: number
  readonly timeoutMs: number

  #running = false
  #sweeping = false
  /** A refresh was requested while a sweep was running: run another one right after it. */
  #again = false
  #timer: ReturnType<typeof setTimeout> | undefined
  #abort: AbortController | null = null
  /** Session the held data belongs to. */
  #session = ''
  /** Sweeps while paused get unique tick keys, so tick slices refetch every time. */
  #pausedSweep = 0

  constructor({ intervalMs = 1000, timeoutMs = 5000 }: GameStoreOptions = {}) {
    this.intervalMs = intervalMs
    this.timeoutMs = timeoutMs
  }

  start(): void {
    if (this.#running) return
    this.#running = true
    document.addEventListener('visibilitychange', this.#onVisibility)
    this.refresh()
  }

  stop(): void {
    this.#running = false
    clearTimeout(this.#timer)
    this.#abort?.abort()
    document.removeEventListener('visibilitychange', this.#onVisibility)
  }

  /** Sweep now (or right after the running sweep), e.g. after sending a command. */
  refresh = (): void => {
    if (!this.#running) return
    if (this.#sweeping) {
      this.#again = true
      return
    }
    clearTimeout(this.#timer)
    void this.#loop()
  }

  /** Mark slices stale so the next sweep fetches them regardless of their cadence. */
  invalidate(cadence?: Cadence): void {
    for (const slice of this.slices) if (!cadence || slice.cadence === cadence) slice.invalidate()
  }

  #onVisibility = () => {
    if (document.visibilityState === 'visible') this.refresh()
  }

  async #loop(): Promise<void> {
    // A hidden tab doesn't poll; becoming visible calls refresh().
    if (!this.#running || document.visibilityState === 'hidden') return
    this.#sweeping = true
    try {
      do {
        this.#again = false
        await this.#sweep()
      } while (this.#again && this.#running)
    } finally {
      this.#sweeping = false
    }
    if (this.#running) this.#timer = setTimeout(() => void this.#loop(), this.intervalMs)
  }

  async #sweep(): Promise<void> {
    const abort = new AbortController()
    this.#abort = abort
    const timeout = setTimeout(() => abort.abort(new DOMException('Sweep timed out', 'TimeoutError')), this.timeoutMs)
    try {
      let info: GameInfo
      try {
        info = await api.gameInfo(abort.signal)
      } catch (e) {
        if (!this.#running) return
        this.error = errorMessage(e)
        // The server may come back restarted with another other-origins policy.
        this.server.invalidate()
        return
      }
      this.info = info
      this.error = null
      this.lastOkAt = Date.now()

      if (info.sessionId !== this.#session) {
        this.#session = info.sessionId
        for (const slice of this.slices) slice.reset()
      }

      const keys = this.#keys(info)
      const due = this.slices.filter((slice) => slice.isDue(keys[slice.cadence]))
      if (due.length === 0) return
      const results = await Promise.allSettled(due.map((slice) => slice.load(keys[slice.cadence], abort.signal)))
      for (const r of results) {
        if (r.status === 'rejected' && !isAbort(r.reason)) console.warn('[GameStore]', r.reason)
      }
      this.sweeps++
    } finally {
      clearTimeout(timeout)
      if (this.#abort === abort) this.#abort = null
    }
  }

  #keys(info: GameInfo): Record<Cadence, string> {
    const { year, month } = parseGameDate(info.date)
    const s = info.sessionId
    return {
      tick: info.isPaused ? `${s}:${info.tick}:paused:${++this.#pausedSweep}` : `${s}:${info.tick}`,
      day: `${s}:${info.date}`,
      month: `${s}:${year}-${month}`,
      session: s,
    }
  }

  // --- actions: send a command, then sweep so the UI reflects it right away ---------------------------------
  async #act(send: () => Promise<CommandResult>): Promise<CommandResult> {
    try {
      return await send()
    } finally {
      this.invalidate('tick')
      this.refresh()
    }
  }

  command = (type: string, args: Record<string, unknown> = {}) => this.#act(() => api.command(type, args))
  console = (command: string) => this.#act(() => api.console(command))
  setPaused = (isPaused: boolean) => this.#act(() => api.pause(isPaused))
  togglePause = () => this.setPaused(!(this.info?.isPaused ?? false))
  setSpeed = (speed: number) => this.#act(() => api.setSpeed(speed))
  togglePin = (productId: string) => this.#act(() => api.togglePin(productId))
  reorderPin = (productId: string, newIndex: number) => this.#act(() => api.reorderPin(productId, newIndex))
}
