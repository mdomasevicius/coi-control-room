<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import type { Snippet } from 'svelte'
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import Button from '@/components/Button/Button.svelte'
  import { flowAt, monthsLeft } from '@/lib/analysis'
  import { api } from '@/logic/api/client'
  import type { FlowSeries } from '@/logic/api/types'
  import { FOOD_IDS } from '@/lib/food'
  import { isByproduct } from '@/lib/byproducts'
  import { NEED_IDS } from '@/lib/settlements'
  import { formatComputing, formatPower, gridSurplus, lastMonths, optionalMod } from '@/lib/modWindow'
  import Bullet from '@/components/Bullet/Bullet.svelte'
  import Runway, { type RunwayRow } from '@/components/Runway/Runway.svelte'
  import Sparkline from '@/components/Sparkline/Sparkline.svelte'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import PageHeader from '@/components/PageHeader/PageHeader.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import ProductTable, { productCsv } from '@/components/ProductTable/ProductTable.svelte'
  import CsvButton from '@/components/CsvButton/CsvButton.svelte'
  import { formatNumber } from '@/lib/format'
  import { getClock, getGameData } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'
  import { href } from '@/lib/router.svelte'
  import { READ_ONLY } from '@/logic/readOnly'

  const clock = getClock()
  const data = getGameData()

  const period = $derived(globalPeriod.value)

  const pinned = $derived(data.pinnedIds.map((id) => data.byId.get(id)).filter((p) => p !== undefined))

  // ---- At a glance: tiles that each pair one number with a picture of it (a bullet bar against the scale and a
  // 12-month sparkline), then the supplies that run out first as bars of time to empty. Readings are from last
  // month (a finished month, so they don't jitter as the current one fills up) or right now for the grids.
  // Mod-backed tiles (grids, health, Unity) are left out without the ControlRoom mod. ----
  const UPKEEP: FlowSeries[] = ['consumedByConstruction', 'consumedByMaintenance']
  const flows = new LiveResource(
    clock,
    () => null,
    async (_, signal) => (await api.stats({ series: ['consumedBySettlements', ...UPKEEP] }, signal)).products,
  )
  const unity = new LiveResource(clock, () => null, (_, signal) => optionalMod(() => api.unity(signal)))
  const unityMonths = new LiveResource(clock, () => null, (_, signal) => optionalMod(() => api.unityHistory('months', 12, signal)))
  const electricity = new LiveResource(clock, () => null, (_, signal) => optionalMod(() => api.electricity(signal)))
  const electricityMonths = new LiveResource(clock, () => null, (_, signal) => optionalMod(() => api.electricityHistory('months', 12, signal)))
  const computing = new LiveResource(clock, () => null, (_, signal) => optionalMod(() => api.computing(signal)))
  const computingMonths = new LiveResource(clock, () => null, (_, signal) => optionalMod(() => api.computingHistory('months', 12, signal)))
  const population = new LiveResource(clock, () => null, (_, signal) => optionalMod(() => api.population(signal)))
  const populationMonths = new LiveResource(clock, () => null, (_, signal) => optionalMod(() => api.populationHistory('months', 12, signal)))
  const AIR = 'Product_Virtual_PollutedAir'
  const WATER = 'Product_Virtual_PollutedWater'
  const pollutionMonths = new LiveResource(clock, () => null, async (_, signal) =>
    (await api.history({ ids: [AIR, WATER], series: ['produced'], count: 12 }, signal)).products,
  )

  const signed = (n: number, format: (n: number) => string) => (n > 0 ? '+' : n < 0 ? '−' : '') + format(Math.abs(n))

  interface GridTile {
    used: number
    capacity: number
    surplus: number
    low: boolean
    format: (n: number) => string
    trend: { values: number[]; tone: 'produced' | 'consumed' }[] | null
  }
  function gridTile(used: number, capacity: number, format: (n: number) => string, capHistory?: number[], useHistory?: number[]): GridTile {
    const s = gridSurplus(used, capacity)
    return {
      used,
      capacity,
      surplus: s.surplus,
      low: s.low,
      format,
      // Capacity against use: the sparkline's gap fill is the surplus (produced hue) or a shortage (consumed hue).
      trend: capHistory && useHistory ? [{ values: lastMonths(capHistory), tone: 'produced' }, { values: lastMonths(useHistory), tone: 'consumed' }] : null,
    }
  }
  const power = $derived.by(() => {
    const e = electricity.data
    if (!e) return null
    const h = electricityMonths.data
    return gridTile(Math.max(e.now.consumed, e.now.demanded), e.now.capacity, formatPower, h?.capacity, h?.consumption)
  })
  // Data centers always "produce" their full capacity; what's in use is the demand (the game's Consumption).
  const compute = $derived.by(() => {
    const c = computing.data
    if (!c) return null
    const h = computingMonths.data
    return gridTile(c.now.demanded, c.now.capacity, formatComputing, h?.capacity, h?.demand)
  })

  /** Health % per month (points added minus taken), only when it lines up with the game's own reading. */
  const healthTrend = $derived.by(() => {
    const h = populationMonths.data
    const now = population.data?.health?.lastMonth
    if (!h || now === undefined) return null
    const values = h.generated.map((g, i) => g - (h.consumed[i] ?? 0))
    return values.length && Math.abs(values[0] - now) <= 1 ? lastMonths(values) : null
  })

  /** Unity net per month (the counted categories' generated minus consumed). */
  const unityTrend = $derived.by(() => {
    const h = unityMonths.data
    if (!h) return null
    const counted = h.categories.filter((c) => !c.ignoreInStats)
    const n = Math.max(0, ...counted.map((c) => Math.max(c.generated?.length ?? 0, c.consumed?.length ?? 0)))
    const net = Array.from({ length: n }, (_, i) => counted.reduce((a, c) => a + (c.generated?.[i] ?? 0) - (c.consumed?.[i] ?? 0), 0))
    return lastMonths(net)
  })

  /** Pollution made per finished month, air and water together (history ends with the month in progress). */
  const pollutionTrend = $derived.by(() => {
    const h = pollutionMonths.data
    if (!h) return null
    const air = h[AIR]?.produced ?? []
    const water = h[WATER]?.produced ?? []
    const n = Math.max(air.length, water.length)
    return Array.from({ length: n }, (_, i) => (air[i] ?? 0) + (water[i] ?? 0)).slice(-13, -1)
  })
  const made = (id: string) => flowAt(data.stats[id]?.produced, 'lastMonth') ?? 0

  // ---- runs out first: every supply that is being used up, as months to empty at last month's use ----
  const used = (id: string, keys: FlowSeries[]) => keys.reduce((a, k) => a + (flowAt(flows.data?.[id]?.[k], 'lastMonth') ?? 0), 0)
  const stock = (id: string) => data.stats[id]?.quantity ?? 0
  const name = (id: string) => data.byId.get(id)?.name ?? id
  const RUNWAY_ROWS = 10

  const runway = $derived.by((): RunwayRow[] => {
    const best = new Map<string, RunwayRow>()
    const offer = (row: RunwayRow) => {
      const prev = best.get(row.key)
      if (!prev || row.months < prev.months) best.set(row.key, row)
    }
    // Food as one supply: settlements eat whatever there is.
    const foods = FOOD_IDS.filter((id) => data.byId.has(id))
    const eaten = foods.reduce((a, id) => a + used(id, ['consumedBySettlements']), 0)
    if (eaten > 0) {
      const top = [...foods].sort((a, b) => used(b, ['consumedBySettlements']) - used(a, ['consumedBySettlements']))[0]
      offer({ key: 'food', icon: top, name: 'Food', months: foods.reduce((a, id) => a + stock(id), 0) / eaten, href: href.food, reason: 'All food, at what settlements ate last month' })
    }
    for (const id of NEED_IDS) {
      if (FOOD_IDS.includes(id)) continue
      const u = used(id, ['consumedBySettlements'])
      if (u > 0) offer({ key: id, icon: id, name: name(id), months: stock(id) / u, href: href.product(id), reason: 'Settlement need, at last month\'s use' })
    }
    for (const id of Object.keys(flows.data ?? {})) {
      const u = used(id, UPKEEP)
      if (u > 0) offer({ key: id, icon: id, name: name(id), months: stock(id) / u, href: href.product(id), reason: 'Construction and maintenance, at last month\'s use' })
    }
    // Any other stock that shrank last month (byproducts left out: for waste, emptying is good news).
    for (const p of data.products) {
      if (p.kind === 'virtual' || isByproduct(p.id)) continue
      const m = monthsLeft(data.stats[p.id] ?? {})
      if (m !== null) offer({ key: p.id, icon: p.id, name: p.name, months: m, href: href.product(p.id), reason: 'Shrinking stock, at last month\'s net' })
    }
    return [...best.values()].sort((a, b) => a.months - b.months).slice(0, RUNWAY_ROWS)
  })

  const trends = new LiveResource(
    clock,
    () => data.pinnedIds.join(','),
    async (ids, signal) =>
      ids ? (await api.history({ ids: ids.split(','), series: ['produced', 'consumed'], count: 12 }, signal)).products : {},
  )

  // Reorder mode for the pinned list; moves are sent to the game (PinnedProductReorderCmd).
  let reordering = $state(false)

  const waiting = $derived(clock.error ? 'Waiting for the game…' : 'Loading…')


</script>

{#snippet tile(label: string, link: string, value: string, low: boolean, body: Snippet)}
  <a class="group flex min-w-0 flex-col gap-2.5 bg-surface px-4 py-3 transition-colors hover:bg-surface-2" href={link}>
    <span class="flex items-baseline justify-between gap-3">
      <span class="text-xs text-ink-2">{label}</span>
      {#if low}<span class="inline-flex items-center gap-1 text-2xs font-semibold text-ink"><TriangleAlert size={13} class="text-critical" aria-hidden="true" />Low</span>{/if}
    </span>
    <span class={['text-xl leading-none font-semibold font-stretch-75%', low && 'text-neg']}>{value}</span>
    <span class="flex flex-col gap-2">{@render body()}</span>
  </a>
{/snippet}

{#snippet gridCard(label: string, link: string, g: GridTile)}
  {@render tile(label, link, signed(g.surplus, g.format), g.low, gridBody)}
  {#snippet gridBody()}
    <!-- Used against capacity, with a tick at 90%: past it the surplus is under a tenth. -->
    <Bullet
      value={g.used}
      max={g.capacity}
      marker={g.capacity * 0.9}
      critical={g.low}
      endLabel={g.format(g.capacity)}
      label="{g.format(g.used)} used of {g.format(g.capacity)}"
    />
    {#if g.trend}<Sparkline fluid height={36} label="{label}: capacity and use per month" series={g.trend} />{/if}
  {/snippet}
{/snippet}

<PageHeader title="Overview" />

<div class="flex flex-col gap-4">
  <!-- One hairline cluster of tiles, like the StatBand, each a label, one number and its picture. -->
  <div class="grid grid-cols-2 gap-px overflow-hidden rounded-ui border border-line bg-line max-lg:[&>*:last-child:nth-child(odd)]:col-span-2 lg:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
    {#if power}{@render gridCard('Electricity', href.electricity, power)}{/if}
    {#if compute}{@render gridCard('Computing', href.computing, compute)}{/if}
    {#if population.data?.health}
      {@const health = population.data.health.lastMonth}
      {@render tile('Health', href.settlements, `${Math.round(health)}%`, false, healthBody)}
      {#snippet healthBody()}
        <Bullet value={health} max={100} endLabel="100%" label="Health {Math.round(health)}% of 100%" />
        {#if healthTrend}<Sparkline fluid height={36} label="Health per month" series={[{ values: healthTrend, color: 'var(--text-2)' }]} />{/if}
      {/snippet}
    {/if}
    {#if unity.data}
      {@const u = unity.data}
      {@render tile('Unity', href.unity, `${signed(Math.round(u.lastMonth.net * 100) / 100, (n) => formatNumber(n))}/mo`, u.lastMonth.net < 0, unityBody)}
      {#snippet unityBody()}
        <Bullet value={u.quantity} max={u.cap} endLabel={formatNumber(Math.round(u.cap))} label="Unity {formatNumber(Math.round(u.quantity))} of {formatNumber(Math.round(u.cap))}" />
        {#if unityTrend}<Sparkline fluid height={36} label="Unity net per month" series={[{ values: unityTrend, tone: 'produced' }]} />{/if}
      {/snippet}
    {/if}
    {@render tile('Pollution', href.factory('waste'), formatNumber(made(AIR) + made(WATER)), false, pollutionBody)}
    {#snippet pollutionBody()}
      {#if pollutionTrend}<Sparkline fluid height={36} label="Pollution made per month" series={[{ values: pollutionTrend, tone: 'consumed' }]} />{/if}
    {/snippet}
  </div>

  {#if runway.length}
    <Panel title="Runs out first" note="at last month's use" flush>
      <Runway rows={runway} />
    </Panel>
  {/if}

  <div class="grid items-start gap-4">
    <Panel title="Pinned" note={globalPeriod.label} flush>
      {#snippet actions()}
        {#if pinned.length}
          <CsvButton name="pinned {period}" label="Download pinned products as CSV" table={() => productCsv(pinned, data.stats, period)} />
        {/if}
        {#if pinned.length > 1 && !READ_ONLY}
          <Button
            size="sm"
            variant={reordering ? 'selected' : 'ghost'}
            aria-pressed={reordering}
            onclick={() => (reordering = !reordering)}
            title="Change the pinned order, in the game too"
          >
            <ArrowUpDown size={15} aria-hidden="true" />{reordering ? 'Done' : 'Reorder'}
          </Button>
        {/if}
      {/snippet}
      {#if !data.loaded}
        <p class="p-4 text-sm text-muted">{waiting}</p>
      {:else if pinned.length === 0}
        <p class="p-4 text-sm text-ink-2">
          Nothing pinned yet. Pin products in the game, or with the star on the
          <a class="underline underline-offset-2 hover:text-ink" href={href.products}>Products</a> page.
        </p>
      {:else}
        <ProductTable
          caption="Pinned products"
          products={pinned}
          stats={data.stats}
          {period}
          trends={trends.data}
          {reordering}
          reorder={(id, i) => void data.reorderPin(id, i)}
        />
      {/if}
    </Panel>

  </div>
</div>
