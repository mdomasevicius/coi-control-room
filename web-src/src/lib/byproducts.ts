// Byproducts the colony wants to get rid of. For these, near-empty storage is good news, so the storage bar must
// not warm toward red as it empties (it does for everything else, where an emptying store is the suspicious case).
export const BYPRODUCT_IDS = new Set([
  'Product_Waste',
  'Product_WastePressed',
  'Product_WasteWater',
  'Product_RetiredWaste',
  'Product_Recyclables',
  'Product_RecyclablesPressed',
  'Product_Exhaust',
  'Product_Slag',
  'Product_SlagCrushed',
  'Product_TitaniumSlag',
  'Product_Sludge',
  'Product_SourWater',
  'Product_SteamDepleted',
  'Product_RedMud',
  'Product_ToxicSlurry',
  'Product_CarbonDioxide',
  // Spent nuclear fuel waits for reprocessing; it piles up rather than runs out.
  'Product_CoreFuelDirty',
  'Product_SpentFuel',
  'Product_SpentMox',
  'Product_UraniumDepleted',
  // Dumped in bulk in COI (excavated overburden), so an empty store isn't a problem either.
  'Product_Rock',
  'Product_Dirt',
  'Product_Virtual_PollutedAir',
  'Product_Virtual_PollutedWater',
])

export const isByproduct = (id: string) => BYPRODUCT_IDS.has(id)
