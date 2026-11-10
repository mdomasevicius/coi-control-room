<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import { api } from '@/logic/api/client'
  import type { ComputingResponse, ElectricityResponse, ModPeriods, PowerHistoryResponse } from '@/logic/api/types'
  import Chart, { type ChartSeries } from '@/components/Chart/Chart.svelte'
  import PageHeader from '@/components/PageHeader/PageHeader.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import StatBand from '@/components/StatBand/StatBand.svelte'
  import Stat from '@/components/StatBand/Stat.svelte'
  import BuildingTable, { type BuildingRow } from './BuildingTable.svelte'
  import { getClock } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'
  import { formatComputing, formatPower, fromMod, gridSurplus, lastMonths, meanOf, modWindow, thisMonthDays, windowCount, windowed } from '@/lib/modWindow'
  import { untrack } from 'svelte'

  // One of the colony's two grids, electricity or computing, each its own page. The game's /api/v1 has neither (they
  // are virtual products it leaves out); both come from the ControlRoom mod. Both read the same way: how much of the
  // capacity is in use now, capacity against use over time (surplus in the produced hue, shortage in the consumed
  // hue), and the building types on either side.
  let { kind }: { kind: 'electricity' | 'computing' } = $props()
  const clock = getClock()
  // App mounts a fresh page per route, so the kind is fixed for this instance.
  const isElectricity = untrack(() => kind === 'electricity')
  const title = isElectricity ? 'Electricity' : 'Computing'

  // The app-wide period. The game's grid stats have no "this month"; it's the average of this month's finished days.
  const period = $derived(globalPeriod.value)
  const periodLabel = $derived(globalPeriod.label)
  const days = $derived(thisMonthDays(clock.info?.date))
  const win = $derived(modWindow(period, clock.info?.date))

  // Only this page's grid is fetched; the other resource stays idle (null key).
  const mine = (is: boolean) => () => (is ? 'now' : null)
  const electricity = new LiveResource(clock, mine(isElectricity), async (key, signal) =>
    key ? fromMod('Electricity', () => api.electricity(signal)) : null,
  )
  const computing = new LiveResource(clock, mine(!isElectricity), async (key, signal) =>
    key ? fromMod('Computing', () => api.computing(signal)) : null,
  )
  const historyKey = (is: boolean) => () => (is && win ? `${win.resolution}:${windowCount(win)}` : null)
  const split = (key: string) => key.split(':') as ['days' | 'months' | 'years', string]
  const electricityHistory = new LiveResource(clock, historyKey(isElectricity), async (key, signal) =>
    key ? fromMod('Electricity', () => api.electricityHistory(split(key)[0], Number(split(key)[1]), signal)) : null,
  )
  const computingHistory = new LiveResource(clock, historyKey(!isElectricity), async (key, signal) =>
    key ? fromMod('Computing', () => api.computingHistory(split(key)[0], Number(split(key)[1]), signal)) : null,
  )
  const dayKey = (is: boolean) => () => (is && period === 'thisMonth' && days > 0 ? String(days) : null)
  const electricityDays = new LiveResource(clock, dayKey(isElectricity), async (key, signal) =>
    key ? fromMod('Electricity', () => api.electricityHistory('days', Number(key), signal)) : null,
  )
  const computingDays = new LiveResource(clock, dayKey(!isElectricity), async (key, signal) =>
    key ? fromMod('Computing', () => api.computingHistory('days', Number(key), signal)) : null,
  )
  // Trend columns always show the last 12 completed months.
  const electricityMonthly = new LiveResource(clock, mine(isElectricity), async (key, signal) =>
    key ? fromMod('Electricity', () => api.electricityHistory('months', 12, signal)) : null,
  )
  const computingMonthly = new LiveResource(clock, mine(!isElectricity), async (key, signal) =>
    key ? fromMod('Computing', () => api.computingHistory('months', 12, signal)) : null,
  )

  // ---- one view model for both grids ----
  interface Grid {
    name: string
    format: (n: number) => string
    /** Right now. */
    used: number
    demanded: number
    capacity: number
    /** Averages over the period. */
    usedAvg: number
    capacityAvg: number
    producers: BuildingRow[]
    consumers: BuildingRow[]
    chart: ChartSeries[] | null
    usedLabel: string
  }

  /** A period average; this month is the mean of this month's finished days (`daily`, newest first). */
  const at = (p: ModPeriods | null | undefined, daily?: number[] | null) =>
    period === 'thisMonth' ? meanOf(daily, days) : (p?.[period] ?? 0)
  const dayValues = (h: PowerHistoryResponse | null, side: 'producers' | 'consumers', id: string) => h?.[side].find((x) => x.id === id)?.values
  const trendOf = (h: PowerHistoryResponse | null, side: 'producers' | 'consumers', id: string) => {
    const s = h?.[side].find((x) => x.id === id)
    return s ? lastMonths(s.values) : null
  }

  function chartOf(h: PowerHistoryResponse | null, use: number[] | undefined, usedLabel: string): ChartSeries[] | null {
    if (!h || !win || h.resolution !== win.resolution) return null
    return [
      // Capacity in the produced hue and use in the consumed hue: the chart's gap fill then shows spare capacity
      // where capacity leads and a shortage where use (or demand) runs above it.
      { label: 'Capacity', values: windowed(h.capacity, win), color: '--series-produced' },
      { label: usedLabel, values: windowed(use, win), color: '--series-consumed' },
    ]
  }

  /** Building types the colony has none of, doing nothing, stay out of the tables. */
  const present = (rows: BuildingRow[]) => rows.filter((r) => r.count > 0 || r.now > 0 || r.average > 0)

  const grids = $derived.by((): Grid[] => {
    const out: Grid[] = []
    const e: ElectricityResponse | null = electricity.data
    if (e) {
      out.push({
        name: 'Electricity',
        format: formatPower,
        used: e.now.consumed,
        demanded: e.now.demanded,
        capacity: e.now.capacity,
        usedAvg: at(e.consumption, electricityDays.data?.consumption),
        capacityAvg: at(e.capacity, electricityDays.data?.capacity),
        usedLabel: 'Consumed',
        producers: present(e.producers.map((p) => ({ id: p.id, name: p.name, count: p.count, now: p.produced, average: at(p.average, dayValues(electricityDays.data, 'producers', p.id)), trend: trendOf(electricityMonthly.data, 'producers', p.id) }))),
        consumers: present(e.consumers.map((c) => ({ id: c.id, name: c.name, count: c.count, now: c.consumed, demanded: c.demanded, average: at(c.average, dayValues(electricityDays.data, 'consumers', c.id)), trend: trendOf(electricityMonthly.data, 'consumers', c.id) }))),
        chart: chartOf(electricityHistory.data, electricityHistory.data?.consumption, 'Consumed'),
      })
    }
    const c: ComputingResponse | null = computing.data
    if (c) {
      out.push({
        name: 'Computing',
        format: formatComputing,
        // Data centers always "produce" their full capacity; what's in use is the demand (the game's Consumption).
        used: c.now.demanded,
        demanded: c.now.demanded,
        capacity: c.now.capacity,
        usedAvg: at(c.demand, computingDays.data?.demand),
        capacityAvg: at(c.capacity, computingDays.data?.capacity),
        usedLabel: 'Consumed',
        producers: present(c.producers.map((p) => ({ id: p.id, name: p.name, count: p.count, now: p.produced, average: at(p.average, dayValues(computingDays.data, 'producers', p.id)), trend: trendOf(computingMonthly.data, 'producers', p.id) }))),
        consumers: present(c.consumers.map((x) => ({ id: x.id, name: x.name, count: x.count, now: x.consumed, demanded: x.demanded, average: at(x.average, dayValues(computingDays.data, 'consumers', x.id)), trend: trendOf(computingMonthly.data, 'consumers', x.id) }))),
        chart: chartOf(computingHistory.data, computingHistory.data?.demand, 'Consumed'),
      })
    }
    return out
  })

  const surplusOf = (g: Grid) => gridSurplus(Math.max(g.used, g.demanded), g.capacity)
  const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)
  const signedFormat = (g: Grid, n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + g.format(Math.abs(n))

  const error = $derived(electricity.error ?? computing.error)
</script>

<PageHeader {title} />

{#if error && grids.length === 0}
  <Panel>
    <p class="flex items-start gap-2 text-sm text-ink-2">
      <TriangleAlert size={16} class="mt-0.5 flex-none text-warning" aria-hidden="true" />{error}
    </p>
  </Panel>
{:else if grids.length === 0}
  <p class="text-sm text-muted">Loading…</p>
{:else}
  {@const g = grids[0]}
  {@const s = surplusOf(g)}
  <div class="flex flex-col gap-4">
    <StatBand>
      <Stat label="Used now" value={g.format(Math.max(g.used, g.demanded))} sub="of {g.format(g.capacity)} capacity" />
      <Stat
        label="Surplus"
        value={signedFormat(g, s.surplus)}
        valueClass={s.low ? 'text-neg' : ''}
        sub={s.surplus < 0 ? 'Demand above capacity' : `${pct(s.share)} of capacity`}
      >
        {#snippet icon()}
          {#if s.low}<TriangleAlert size={14} class="text-warning" aria-hidden="true" />{/if}
        {/snippet}
      </Stat>
      <Stat label="Capacity" value={g.format(g.capacity)} sub="{g.producers.reduce((a, r) => a + r.count, 0)} {g.producers.length === 1 ? g.producers[0].name.toLowerCase() + 's' : 'generators'}" />
      <Stat label="Average use" value={g.format(g.usedAvg)} sub={periodLabel} />
    </StatBand>

    {#if g.chart && win}
      <Panel title="Capacity and {g.usedLabel.toLowerCase()}" note={win.title}>
        <Chart ariaLabel="{g.name} capacity and {g.usedLabel.toLowerCase()}" labels={win.labels} series={g.chart} format={g.format} />
      </Panel>
    {/if}
    <div class="grid items-start gap-4 xl:grid-cols-2">
      <Panel title="Production" note={periodLabel} flush>
        <BuildingTable rows={g.producers} format={g.format} tone="produced" nowLabel="Now" {periodLabel} empty="Nothing generates {g.name.toLowerCase()}." />
      </Panel>
      <Panel title="Consumption" note={periodLabel} flush>
        <BuildingTable rows={g.consumers} format={g.format} tone="consumed" nowLabel="Now" {periodLabel} empty="Nothing uses {g.name.toLowerCase()}." />
      </Panel>
    </div>
  </div>
{/if}
