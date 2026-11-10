<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import { flowAt } from '@/lib/analysis'
  import { api } from '@/logic/api/client'
  import type { FlowSeries } from '@/logic/api/types'
  import Chart from '@/components/Chart/Chart.svelte'
  import Icon from '@/components/Icon/Icon.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import StatBand from '@/components/StatBand/StatBand.svelte'
  import Stat from '@/components/StatBand/Stat.svelte'
  import {
    activeIds,
    formatMonths,
    handlers,
    hasData,
    historyOf,
    lastsMonths,
    periodMonths,
    stackSeries,
    uniqueBuildings,
  } from '@/lib/factoryFlows'
  import { formatNumber } from '@/lib/format'
  import { getClock, getGameData } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'
  import { applyWindow, historyWindow, periodLabels, windowKey, sparkValues } from '@/lib/historyWindow'
  import { href } from '@/lib/router.svelte'
  import UpkeepFlowTable from './UpkeepFlowTable.svelte'

  // Raw resources taken from the ground (producedByMining) and what is burned as fuel (consumedAsFuel).
  const clock = getClock()
  const data = getGameData()

  const period = $derived(globalPeriod.value)
  // Charts follow the period (see lib/historyWindow): months around it, its year, or every year.
  const win = $derived(historyWindow(period, clock.info?.date))
  const periodLabel = $derived(globalPeriod.label)

  const SERIES = ['producedByMining', 'consumedAsFuel', 'produced', 'consumed'] as const
  const flows = new LiveResource(clock, () => null, async (_, signal) => (await api.stats({ series: [...SERIES] }, signal)).products)
  // Mining entities (excavators, oil pumps, tree harvesters): lifetime names them all, the period gives amounts.
  const lifetime = new LiveResource(clock, () => null, (_, signal) => api.sources({ period: 'lifetime' }, signal))
  const sources = new LiveResource(clock, () => period, (p, signal) => api.sources({ period: p }, signal))

  const unlocked = $derived(new Set(data.products.map((p) => p.id)))
  const mined = $derived(activeIds(flows.data, 'producedByMining').filter((id) => unlocked.has(id)))
  const fuels = $derived(activeIds(flows.data, 'consumedAsFuel').filter((id) => unlocked.has(id)))

  const history = new LiveResource(
    clock,
    () => `${[...new Set([...mined, ...fuels])].join(',')}|${windowKey(win)}`,
    async (key, signal) => {
      const list = key.split('|')[0]
      return list ? applyWindow(await api.history({ ids: list.split(','), series: ['producedByMining', 'consumedAsFuel'], resolution: win.resolution, count: win.count }, signal), win) : null
    },
  )

  const name = (id: string) => data.byId.get(id)?.name ?? id
  const flow = (id: string, key: FlowSeries) => flowAt(flows.data?.[id]?.[key], period) ?? 0
  const byPeriod = (list: string[], key: FlowSeries) => [...list].sort((a, b) => flow(b, key) - flow(a, key))
  const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–')
  const months = $derived(periodMonths(period, clock.info?.date))
  const lasts = (id: string) => lastsMonths(data.stats[id]?.quantity, flow(id, 'consumedAsFuel'), months)

  const miners = (id: string) => handlers(lifetime.data, id, 'produced', (h) => !h.recipe)
  const totalMined = $derived(mined.reduce((a, id) => a + flow(id, 'producedByMining'), 0))
  const totalBurned = $derived(fuels.reduce((a, id) => a + flow(id, 'consumedAsFuel'), 0))
  const shortest = $derived(
    fuels
      .map((id) => ({ id, months: lasts(id) }))
      .filter((x): x is { id: string; months: number } => x.months !== null)
      .sort((a, b) => a.months - b.months)[0] ?? null,
  )

  // Each mining entity with the products it extracts and how much in the period.
  const machines = $derived.by(() => {
    const list = uniqueBuildings(mined.map(miners))
    const periodSrc = sources.dataParams === period ? sources.data : null
    const made = (ids: string[], id: string) =>
      handlers(periodSrc, id, 'produced').reduce((a, h) => a + (ids.includes(h.id) ? h.quantity : 0), 0)
    return list
      .map((m) => {
        // Only what it extracted in the period; a building that mined nothing is listed as idle.
        const products = mined
          .filter((id) => miners(id).some((h) => m.ids.includes(h.id)))
          .map((id) => ({ id, quantity: made(m.ids, id) }))
          .filter((p) => p.quantity > 0)
          .sort((a, b) => b.quantity - a.quantity)
        return { ...m, products, total: products.reduce((a, p) => a + p.quantity, 0) }
      })
      .sort((a, b) => b.total - a.total)
  })

  const idleNote = $derived.by(() => {
    const idle = machines.filter((m) => m.total === 0).length
    return idle ? `${idle} idle ${periodLabel}` : `All mined ${periodLabel}`
  })

  const charts = $derived.by(() => {
    const h = history.data
    if (!h) return null
    return {
      labels: periodLabels(h),
      mined: stackSeries(h, mined, 'producedByMining', '--series-produced', name),
      fuel: stackSeries(h, fuels, 'consumedAsFuel', '--series-consumed', name),
      spark: (key: FlowSeries) => (id: string) => sparkValues(historyOf(h, id, key), win),
    }
  })
</script>

{#snippet swatch(bg: 'bg-produced' | 'bg-consumed')}
  <span class={['h-1 w-4 flex-none rounded-full', bg]} aria-hidden="true"></span>
{/snippet}

<div class="flex flex-col gap-4">

  {#if !flows.data}
    <p class="text-sm text-muted">{flows.error ?? 'Loading…'}</p>
  {:else}
    <StatBand>
      <Stat label="Mined" value={formatNumber(totalMined)} sub="{mined.length} {mined.length === 1 ? 'resource' : 'resources'}">
        {#snippet icon()}{@render swatch('bg-produced')}{/snippet}
      </Stat>
      <Stat label="Fuel burned" value={formatNumber(totalBurned)} sub="{fuels.length} {fuels.length === 1 ? 'fuel' : 'fuels'}">
        {#snippet icon()}{@render swatch('bg-consumed')}{/snippet}
      </Stat>
      <Stat
        label="Shortest supply"
        value={shortest ? formatMonths(shortest.months) : '–'}
        sub={shortest ? name(shortest.id) : 'No fuel burned'}
        href={shortest ? href.product(shortest.id) : undefined}
      />
      <Stat label="Mining buildings" value={String(machines.length)} sub={machines.length ? idleNote : 'None seen yet'} />
    </StatBand>

    {#if charts && (hasData(charts.mined) || hasData(charts.fuel))}
      <Panel title={win.title}>
        <div class="grid gap-8">
          {#if hasData(charts.mined)}
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="text-sm font-medium text-ink-2">Mined</h3>
              <Chart ariaLabel="Mined per month" labels={charts.labels} series={charts.mined} lastInProgress={win.inProgress} />
            </div>
          {/if}
          {#if hasData(charts.fuel)}
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="text-sm font-medium text-ink-2">Burned as fuel</h3>
              <Chart ariaLabel="Burned as fuel per month" labels={charts.labels} series={charts.fuel} lastInProgress={win.inProgress} />
            </div>
          {/if}
        </div>
      </Panel>
    {/if}

    <div class="grid items-start gap-4 xl:grid-cols-[3fr_2fr]">
      <Panel title="Mined" note={periodLabel} flush>
        <UpkeepFlowTable
          ids={byPeriod(mined, 'producedByMining')}
          active={(id) => flow(id, 'producedByMining') > 0}
          columns={[
            { label: 'Mined', value: (id) => formatNumber(flow(id, 'producedByMining')), strong: true },
            { label: 'Of all made', title: `Share of everything produced, ${periodLabel}`, value: (id) => pct(flow(id, 'producedByMining'), flow(id, 'produced')) },
            { label: 'In stock', value: (id) => formatNumber(data.stats[id]?.quantity) },
          ]}
          buildings={miners}
          buildingsLabel="Mined by"
          spark={charts?.spark('producedByMining')}
          tone="produced"
          sparkLabel="mined"
          empty="Nothing mined yet."
        />
      </Panel>

      <div class="flex flex-col gap-4">
        <Panel title="Fuel" note={periodLabel} flush>
          <UpkeepFlowTable
            ids={byPeriod(fuels, 'consumedAsFuel')}
          active={(id) => flow(id, 'consumedAsFuel') > 0}
            columns={[
              { label: 'Burned', value: (id) => formatNumber(flow(id, 'consumedAsFuel')), strong: true },
              { label: 'Of all used', title: `Share of everything consumed, ${periodLabel}`, value: (id) => pct(flow(id, 'consumedAsFuel'), flow(id, 'consumed')) },
              { label: 'In stock', value: (id) => formatNumber(data.stats[id]?.quantity) },
              { label: 'Lasts', title: `At the ${periodLabel} fuel rate`, value: (id) => formatMonths(lasts(id)) },
            ]}
            spark={charts?.spark('consumedAsFuel')}
            tone="consumed"
            sparkLabel="burned as fuel"
            empty="No fuel burned yet."
          />
        </Panel>

        {#if machines.length}
          <Panel title="Mining buildings" note={periodLabel}>
            <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {#each machines as m (m.id)}
                <li class="flex items-center gap-3 rounded-ui bg-surface-2 p-3">
                  <Icon id={m.id} size={36} />
                  <div class="flex min-w-0 flex-col gap-1.5">
                    <span class="truncate text-sm font-semibold">{m.name}</span>
                    <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {#if m.products.length === 0}<span class="text-xs text-muted">Idle</span>{/if}
                      {#each m.products as p (p.id)}
                        <a class="flex items-center gap-1 text-xs text-ink-2 tabular-nums hover:underline" href={href.product(p.id)} title={name(p.id)}>
                          <Icon id={p.id} size={22} />{formatNumber(p.quantity)}
                        </a>
                      {/each}
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
          </Panel>
        {/if}
      </div>
    </div>
  {/if}
</div>
