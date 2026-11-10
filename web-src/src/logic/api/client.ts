import type {
  UnityHistoryResponse,
  ComputingResponse,
  ElectricityResponse,
  PopulationHistoryResponse,
  PopulationResponse,
  PowerHistoryResponse,
  UnityResolution,
  UnityResponse,
  ApiErrorBody,
  CommandInfo,
  CommandResult,
  GameInfo,
  HistoryResponse,
  ProductsResponse,
  Resolution,
  Series,
  ServerInfo,
  SourcesPeriod,
  SourcesResponse,
  StatsResponse,
} from '@/logic/api/types'
import { READ_ONLY } from '@/logic/readOnly'

// All requests are same-origin: the game API has no CORS. In dev the Vite server proxies these paths to the game;
// in the mod build the game serves the app itself.
const V1 = '/api/v1'
const MAX_UI_SPEED = 3

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | null,
  ) {
    super(body?.message ?? `HTTP ${status}`)
    this.name = 'ApiError'
  }
}

/** Selects products: explicit ids, the in-game pinned ones, or (default) all unlocked. */
export type ProductSelector = { ids?: string[]; pinned?: boolean }

type Query = Record<string, string | number | boolean | string[] | undefined>

function qs(query: Query): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === false) continue
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','))
    } else {
      params.set(key, String(value))
    }
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null
    throw new ApiError(res.status, body)
  }
  return (await res.json()) as T
}

const get = <T>(path: string, query: Query = {}, signal?: AbortSignal) =>
  request<T>(path + qs(query), { signal })

export const api = {
  gameInfo: (signal?: AbortSignal) => get<GameInfo>(`${V1}/game-info`, {}, signal),

  serverInfo: (signal?: AbortSignal) => get<ServerInfo>(`${V1}/server-info`, {}, signal),

  products: (sel: ProductSelector & { includeLocked?: boolean } = {}, signal?: AbortSignal) =>
    get<ProductsResponse>(`${V1}/products`, { ...sel }, signal),

  stats: (sel: ProductSelector & { series?: Series[] } = {}, signal?: AbortSignal) =>
    get<StatsResponse>(`${V1}/products/stats`, { ...sel }, signal),

  history: (
    sel: ProductSelector & { series?: Series[]; resolution?: Resolution; count?: number } = {},
    signal?: AbortSignal,
  ) => get<HistoryResponse>(`${V1}/products/history`, { ...sel }, signal),

  sources: (sel: ProductSelector & { period?: SourcesPeriod } = {}, signal?: AbortSignal) =>
    get<SourcesResponse>(`${V1}/products/sources`, { ...sel }, signal),

  /** Icon URL. `sessionId` busts the (immutable) browser cache when a different save is loaded. */
  iconUrl: (id: string, sessionId: string) =>
    `${V1}/icons/${encodeURIComponent(id)}?v=${encodeURIComponent(sessionId)}`,

  /** Current camera view as JPG; 0 = game window size. `t` defeats caching. */
  screenshotUrl: (width = 0, height = 0) =>
    `/screenshot${qs({ width: width || undefined, height: height || undefined, t: Date.now() })}`,

  commands: (filter?: string, signal?: AbortSignal) => get<CommandInfo[]>('/commands', { filter }, signal),

  /** Sends an input command to the game; resolves once the simulation processed it. */
  command: (type: string, args: Record<string, unknown> = {}): Promise<CommandResult> =>
    READ_ONLY
      ? Promise.reject(new Error('Read-only: commands are disabled'))
      : request<CommandResult>('/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, args }),
        }),

  pause: (isPaused: boolean) => api.command('SetSimPauseStateCmd', { isPaused }),
  /**
   * GameSpeedChangeCmd clamps to the game's UI maximum (3x); faster speeds go through the console's
   * set_game_speed, which allows more.
   */
  setSpeed: (speed: number) =>
    speed <= MAX_UI_SPEED
      ? api.command('GameSpeedChangeCmd', { newSpeedMultiplier: speed })
      : api.console(`set_game_speed ${speed}`),
  togglePin: (productToToggle: string) => api.command('PinToggleCmd', { productToToggle }),
  /** Moves a pinned product to `newIndex` (0-based) in the game's pinned list. */
  reorderPin: (productToMove: string, newIndex: number) =>
    api.command('PinnedProductReorderCmd', { productToMove, newIndex }),
  /**
   * The speed above 3x the game offers (its 4th speed button), from the ControlRoom mod: the game shows it in sandbox
   * games or once set_game_speed went above 3. Without the mod (404) the answer is "none known".
   */
  modSpeed: async (signal?: AbortSignal): Promise<{ superSpeed: number | null }> => {
    try {
      return await get<{ superSpeed: number | null }>('/api/mods/control-room/speed', {}, signal)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return { superSpeed: null }
      throw e
    }
  },
  /** Unity now, per category and this month's ledger (ControlRoom mod; 404 without it). */
  unity: (signal?: AbortSignal) => get<UnityResponse>('/api/mods/control-room/unity', {}, signal),
  /** Unity per category over time, newest completed period first (ControlRoom mod). */
  unityHistory: (resolution: UnityResolution, count: number, signal?: AbortSignal) =>
    get<UnityHistoryResponse>('/api/mods/control-room/unity/history', { resolution, count }, signal),
  /** Electricity now, per period and per building type, in kW (ControlRoom mod; 404 without it). */
  electricity: (signal?: AbortSignal) => get<ElectricityResponse>('/api/mods/control-room/electricity', {}, signal),
  electricityHistory: (resolution: UnityResolution, count: number, signal?: AbortSignal) =>
    get<PowerHistoryResponse>('/api/mods/control-room/electricity/history', { resolution, count }, signal),
  /** Computing now, per period and per building type, in TFLOPS (ControlRoom mod; 404 without it). */
  computing: (signal?: AbortSignal) => get<ComputingResponse>('/api/mods/control-room/computing', {}, signal),
  computingHistory: (resolution: UnityResolution, count: number, signal?: AbortSignal) =>
    get<PowerHistoryResponse>('/api/mods/control-room/computing/history', { resolution, count }, signal),
  /** Population, health, disease, births and each settlement (ControlRoom mod; 404 without it). */
  population: (signal?: AbortSignal) => get<PopulationResponse>('/api/mods/control-room/population', {}, signal),
  populationHistory: (resolution: UnityResolution, count: number, signal?: AbortSignal) =>
    get<PopulationHistoryResponse>('/api/mods/control-room/population/history', { resolution, count }, signal),
  /** Runs a console command. The API only reports success, not the console's text output. */
  console: (command: string) => api.command('GameConsoleCmd', { command }),
}
