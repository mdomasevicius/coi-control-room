// The API has no product categories, so food / crops / farm inputs are a curated list of Captain of Industry
// ids plus whatever the data reveals (taken by a settlement food market, grown on a farm, consumed by farms).
// Lists are in display order; it also fixes each product's chart color.
import type { ProductStats, SourcesResponse } from '@/logic/api/types'

export const FOOD_IDS = [
  'Product_Potato',
  'Product_Corn',
  'Product_Vegetables',
  'Product_Fruit',
  'Product_Bread',
  'Product_Meat',
  'Product_Eggs',
  'Product_Tofu',
  'Product_Sausage',
  'Product_Snack',
  'Product_Cake',
  'Product_FoodPack',
]

export const CROP_IDS = [
  'Product_Potato',
  'Product_Corn',
  'Product_Wheat',
  'Product_Soybean',
  'Product_Canola',
  'Product_SugarCane',
  'Product_Vegetables',
  'Product_Fruit',
  'Product_Poppy',
]

export const FARM_INPUT_IDS = [
  'Product_Water',
  'Product_FertilizerOrganic',
  'Product_Fertilizer',
  'Product_Fertilizer2',
  'Product_AnimalFeed',
]

export const FERTILIZER_IDS = ['Product_FertilizerOrganic', 'Product_Fertilizer', 'Product_Fertilizer2']

const isFarmEntity = (id: string) => /^Farm/.test(id) || /Farm$/.test(id)
const isFoodMarket = (id: string) => /SettlementFood/.test(id)

function sorted(curated: string[], found: Set<string>): string[] {
  const extra = [...found].filter((id) => !curated.includes(id)).sort()
  return [...curated, ...extra]
}

/** Classifies the unlocked products. `lifetime` = sources for period=lifetime (for discovery). */
export function classify(
  unlocked: Set<string>,
  extra: Record<string, ProductStats>,
  lifetime: SourcesResponse | null,
  kinds: Map<string, string>,
) {
  const food = new Set<string>()
  const crops = new Set<string>()
  const inputs = new Set<string>()

  for (const [id, s] of Object.entries(extra)) if (s.consumedByFarms?.[4]) inputs.add(id)
  for (const [id, p] of Object.entries(lifetime?.products ?? {})) {
    // Food is what the food market takes. Not "consumed by settlements": that also counts household goods,
    // appliances, electronics and luxury goods, which have their own settlement modules.
    for (const r of p.consumed.rows) if ('entity' in r && isFoodMarket(r.entity)) food.add(id)
    // Farms "produce" water from rain; that's not a crop.
    for (const r of p.produced.rows) if ('entity' in r && isFarmEntity(r.entity) && kinds.get(id) !== 'fluid') crops.add(id)
  }

  const keep = (ids: string[]) => ids.filter((id) => unlocked.has(id))
  return {
    food: keep(sorted(FOOD_IDS, food)),
    crops: keep(sorted(CROP_IDS, crops)),
    inputs: keep(sorted(FARM_INPUT_IDS, inputs)),
  }
}

export { isFarmEntity }

/** Categorical slots (validated palette, fixed order); products past the 8th share the "other" color. */
// Slots 1 and 2 are the produced blue and consumed orange, so entities (foods, farm inputs) start at slot 3.
export const catColor = (i: number) => (i < 6 ? `--cat-${i + 3}` : '--muted')
