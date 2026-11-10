<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import { flowAt } from '@/lib/analysis'
  import { api } from '@/logic/api/client'
  import type { FlowSeries } from '@/logic/api/types'
  import Chart from '@/components/Chart/Chart.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import StatBand from '@/components/StatBand/StatBand.svelte'
  import Stat from '@/components/StatBand/Stat.svelte'
  import { activeIds, handlers, hasData, historyOf, stackSeries } from '@/lib/factoryFlows'
  import { formatNumber } from '@/lib/format'
  import { getClock, getGameData } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'
  import { applyWindow, historyWindow, periodLabels, windowKey, sparkValues } from '@/lib/historyWindow'
  import { href } from '@/lib/router.svelte'
  import UpkeepFlowTable from './UpkeepFlowTable.svelte'

  // What the colony throws away (dumped series) and the pollution it makes.
  const clock = getClock()
  const data = getGameData()

  const period = $derived(globalPeriod.value)
  // Charts follow the period (see lib/historyWindow): months around it, its year, or every year.
  const win = $derived(historyWindow(period, clock.info?.date))
  const periodLabel = $derived(globalPeriod.label)

  const AIR = 'Product_Virtual_PollutedAir'
  const WATER = 'Product_Virtual_PollutedWater'

  const flows = new LiveResource(clock, () => null, async (_, signal) => (await api.stats({ series: ['dumped', 'produced'] }, signal)).products)
  // Who dumps each product: lifetime, so a dump that was idle this period is still named.
  const lifetime = new LiveResource(clock, () => null, (_, signal) => api.sources({ period: 'lifetime' }, signal))
  const sources = new LiveResource(
    clock,
    () => period,
    (p, signal) => api.sources({ ids: [AIR, WATER], period: p }, signal),
  )

  const unlocked = $derived(new Set(data.products.map((p) => p.id)))
  const dumped = $derived(activeIds(flows.data, 'dumped').filter((id) => unlocked.has(id)))
  const pollution = $derived([AIR, WATER].filter((id) => (flows.data?.[id]?.produced?.[4] ?? 0) > 0))

  const history = new LiveResource(
    clock,
    () => `${[...dumped, ...pollution].join(',')}|${windowKey(win)}`,
    async (key, signal) => {
      const list = key.split('|')[0]
      return list ? applyWindow(await api.history({ ids: list.split(','), series: ['dumped', 'produced'], resolution: win.resolution, count: win.count }, signal), win) : null
    },
  )

  const name = (id: string) => data.byId.get(id)?.name ?? id
  const flow = (id: string, key: FlowSeries) => flowAt(flows.data?.[id]?.[key], period) ?? 0
  const byPeriod = (list: string[], key: FlowSeries) => [...list].sort((a, b) => flow(b, key) - flow(a, key))
  const dumpedSorted = $derived(byPeriod(dumped, 'dumped'))
  const totalDumped = $derived(dumped.reduce((a, id) => a + flow(id, 'dumped'), 0))
  const top = $derived(dumpedSorted.find((id) => flow(id, 'dumped') > 0) ?? null)

  const charts = $derived.by(() => {
    const h = history.data
    if (!h) return null
    return {
      labels: periodLabels(h),
      dumped: stackSeries(h, dumped, 'dumped', '--series-consumed', name),
      pollution: stackSeries(h, pollution, 'produced', '--series-produced', name),
      spark: (key: FlowSeries) => (id: string) => sparkValues(historyOf(h, id, key), win),
    }
  })
</script>

<div class="flex flex-col gap-4">

  {#if !flows.data}
    <p class="text-sm text-muted">{flows.error ?? 'Loading…'}</p>
  {:else}
    <StatBand>
      <Stat label="Dumped" value={formatNumber(totalDumped)} sub="{dumped.length} {dumped.length === 1 ? 'kind' : 'kinds'}">
        {#snippet icon()}<span class="h-1 w-4 flex-none rounded-full bg-consumed" aria-hidden="true"></span>{/snippet}
      </Stat>
      <Stat
        label="Dumped most"
        value={top ? formatNumber(flow(top, 'dumped')) : '–'}
        sub={top ? name(top) : 'Nothing dumped'}
        href={top ? href.product(top) : undefined}
      />
      <Stat label="Air pollution" value={formatNumber(flow(AIR, 'produced'))} href={href.product(AIR)} />
      <Stat label="Water pollution" value={formatNumber(flow(WATER, 'produced'))} href={href.product(WATER)} />
    </StatBand>

    {#if charts && (hasData(charts.dumped) || hasData(charts.pollution))}
      <Panel title={win.title}>
        <div class="grid gap-8">
          {#if hasData(charts.dumped)}
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="text-sm font-medium text-ink-2">Dumped</h3>
              <Chart ariaLabel="Dumped per month" labels={charts.labels} series={charts.dumped} lastInProgress={win.inProgress} />
            </div>
          {/if}
          {#if hasData(charts.pollution)}
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="text-sm font-medium text-ink-2">Pollution</h3>
              <Chart ariaLabel="Pollution per month" labels={charts.labels} series={charts.pollution} lastInProgress={win.inProgress} />
            </div>
          {/if}
        </div>
      </Panel>
    {/if}

    <div class="grid items-start gap-4 xl:grid-cols-[3fr_2fr]">
      <Panel title="Dumped" note={periodLabel} flush>
        <UpkeepFlowTable
          ids={dumpedSorted}
          active={(id) => flow(id, 'dumped') > 0}
          columns={[
            { label: 'Dumped', value: (id) => formatNumber(flow(id, 'dumped')), strong: true },
            { label: 'In stock', value: (id) => formatNumber(data.stats[id]?.quantity) },
          ]}
          storage
          buildings={(id) => handlers(lifetime.data, id, 'consumed')}
          buildingsLabel="Dumped at"
          spark={charts?.spark('dumped')}
          tone="consumed"
          sparkLabel="dumped"
          empty="Nothing dumped yet."
        />
      </Panel>

      <Panel title="Pollution" note={periodLabel} flush>
        <UpkeepFlowTable
          ids={pollution}
          active={(id) => flow(id, 'produced') > 0}
          columns={[{ label: 'Made', value: (id) => formatNumber(flow(id, 'produced')), strong: true }]}
          buildings={(id) => (sources.dataParams === period ? handlers(sources.data, id, 'produced') : [])}
          buildingsLabel="Made by"
          spark={charts?.spark('produced')}
          tone="produced"
          sparkLabel="made"
          empty="No pollution yet."
        />
      </Panel>
    </div>
  {/if}
</div>
