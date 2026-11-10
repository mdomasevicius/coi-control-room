// Settlements, as far as the API can see them: it has no population, health or Unity data, only product flows
// tagged as consumed / produced by settlements, and the settlement modules (Food market, Waste collection, …) that
// show up as entities in `sources`. Needs and outputs are a curated list of COI ids plus whatever the data reveals,
// limited to unlocked products.
import type { ProductStats, SourcesResponse } from '@/logic/api/types'
import { FOOD_IDS } from '@/lib/food'

/** Goods settlements consume (food first, then services), in display order. */
export const NEED_IDS = [
  ...FOOD_IDS,
  'Product_Water',
  'Product_HouseholdGoods',
  'Product_HouseholdAppliances',
  'Product_ConsumerElectronics',
  'Product_LuxuryGoods',
  'Product_MedicalSupplies',
  'Product_MedicalSupplies2',
  'Product_MedicalSupplies3',
]

/** What settlements give back. */
export const OUTPUT_IDS = ['Product_Waste', 'Product_WasteWater', 'Product_Recyclables']

export const isSettlementEntity = (entity: string) => entity.startsWith('Settlement')

const lifetime = (flow: number[] | undefined) => flow?.[4] ?? 0

export function classifySettlement(unlocked: Set<string>, stats: Record<string, ProductStats>) {
  const used = (id: string, key: 'consumedBySettlements' | 'producedBySettlements') => lifetime(stats[id]?.[key]) > 0
  const pick = (curated: string[], key: 'consumedBySettlements' | 'producedBySettlements', keep: (id: string) => boolean) => {
    const discovered = Object.keys(stats).filter((id) => used(id, key) && !curated.includes(id)).sort()
    return [...curated.filter(keep), ...discovered].filter((id) => unlocked.has(id))
  }
  // Only what settlements actually used or gave back (no zero rows for goods not in play); curated lists set the order.
  return {
    needs: pick(NEED_IDS, 'consumedBySettlements', (id) => used(id, 'consumedBySettlements')),
    outputs: pick(OUTPUT_IDS, 'producedBySettlements', (id) => used(id, 'producedBySettlements')),
  }
}

export interface SettlementModule {
  entity: string
  name: string
  consumes: string[]
  produces: string[]
}

/** Settlement modules and the products each handles, from lifetime sources. */
export function settlementModules(src: SourcesResponse | null): SettlementModule[] {
  if (!src) return []
  const byEntity = new Map<string, SettlementModule>()
  for (const [pid, sides] of Object.entries(src.products)) {
    for (const side of ['consumed', 'produced'] as const) {
      for (const row of sides[side].rows) {
        if (!('entity' in row) || !isSettlementEntity(row.entity) || row.quantity <= 0) continue
        const m = byEntity.get(row.entity) ?? {
          entity: row.entity,
          name: src.names[row.entity] ?? row.entity,
          consumes: [],
          produces: [],
        }
        ;(side === 'consumed' ? m.consumes : m.produces).push(pid)
        byEntity.set(row.entity, m)
      }
    }
  }
  return [...byEntity.values()].sort((a, b) => a.name.localeCompare(b.name))
}
