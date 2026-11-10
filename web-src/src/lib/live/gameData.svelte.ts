import { api } from '@/logic/api/client'
import type { Product, ProductStats, Series } from '@/logic/api/types'
import type { GameClock } from '@/lib/live/clock.svelte'
import { LiveResource } from '@/lib/live/resource.svelte'

export const CORE_SERIES: Series[] = ['quantity', 'stored', 'storageCapacity', 'produced', 'consumed']

interface Snapshot {
  products: Product[]
  pinnedIds: string[]
  stats: Record<string, ProductStats>
}

/**
 * The catalog of unlocked products, the pinned list and core stats for all of them, refreshed on every
 * clock revision and shared by all views (three small requests, ~25 KB together).
 */
export class GameData {
  #res: LiveResource<null, Snapshot>

  get products(): Product[] {
    return this.#res.data?.products ?? []
  }
  get pinnedIds(): string[] {
    return this.#res.data?.pinnedIds ?? []
  }
  get stats(): Record<string, ProductStats> {
    return this.#res.data?.stats ?? {}
  }
  get loaded() {
    return this.#res.data !== null
  }
  get error() {
    return this.#res.error
  }
  readonly byId = $derived(new Map(this.products.map((p) => [p.id, p])))
  readonly pinnedSet = $derived(new Set(this.pinnedIds))

  constructor(clock: GameClock) {
    this.#res = new LiveResource(
      clock,
      () => null,
      async (_, signal) => {
        const [catalog, pinned, stats] = await Promise.all([
          api.products({}, signal),
          api.products({ pinned: true }, signal),
          api.stats({ series: CORE_SERIES }, signal),
        ])
        return {
          products: catalog.products,
          pinnedIds: pinned.products.map((p) => p.id),
          stats: stats.products,
        }
      },
    )
  }

  reload = () => this.#res.reload()

  async togglePin(id: string) {
    const res = await api.togglePin(id)
    this.reload()
    return res
  }

  async reorderPin(id: string, newIndex: number) {
    const res = await api.reorderPin(id, newIndex)
    this.reload()
    return res
  }
}
