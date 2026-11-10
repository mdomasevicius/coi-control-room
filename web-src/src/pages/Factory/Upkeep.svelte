<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import { flowAt } from '@/lib/analysis'
  import { api } from '@/logic/api/client'
  import type { FlowPeriod, FlowSeries } from '@/logic/api/types'
  import Chart from '@/components/Chart/Chart.svelte'
  import Icon from '@/components/Icon/Icon.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import StatBand from '@/components/StatBand/StatBand.svelte'
  import Stat from '@/components/StatBand/Stat.svelte'
  import { activeIds, formatMonths, hasData, historyOf, lastsMonths, periodMonths, stackSeries } from '@/lib/factoryFlows'
  import { formatNumber } from '@/lib/format'
  import { getClock, getGameData } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'
  import { applyWindow, historyWindow, periodLabels, windowKey, sparkValues } from '@/lib/historyWindow'
  import { href } from '@/lib/router.svelte'
  import UpkeepFlowTable from './UpkeepFlowTable.svelte'

  // What building and keeping buildings running costs, and what tearing them down gives back.
  const clock = getClock()
  const data = getGameData()

  const period = $derived(globalPeriod.value)
  // Charts follow the period (see lib/historyWindow): months around it, its year, or every year.
  const win = $derived(historyWindow(period, clock.info?.date))
  const periodLabel = $derived(globalPeriod.label)

  const SERIES = ['consumedByConstruction', 'consumedByMaintenance', 'producedByDeconstruction'] as const
  const flows = new LiveResource(clock, () => null, async (_, signal) => (await api.stats({ series: [...SERIES] }, signal)).products)
  // Maintenance depots: the machines whose recipes turn parts into maintenance (lifetime, so idle depots still show).
  const lifetime = new LiveResource(clock, () => null, (_, signal) => api.sources({ period: 'lifetime' }, signal))

  const unlocked = $derived(new Set(data.products.map((p) => p.id)))
  const ids = (key: FlowSeries) => activeIds(flows.data, key).filter((id) => unlocked.has(id))
  const construction = $derived(ids('consumedByConstruction'))
  const maintenance = $derived(ids('consumedByMaintenance'))
  const recovered = $derived(ids('producedByDeconstruction'))

  const history = new LiveResource(
    clock,
    () => `${[...new Set([...construction, ...maintenance, ...recovered])].join(',')}|${windowKey(win)}`,
    async (key, signal) => {
      const list = key.split('|')[0]
      return list ? applyWindow(await api.history({ ids: list.split(','), series: [...SERIES], resolution: win.resolution, count: win.count }, signal), win) : null
    },
  )

  const name = (id: string) => data.byId.get(id)?.name ?? id
  const flow = (id: string, key: FlowSeries, p: FlowPeriod = period) => flowAt(flows.data?.[id]?.[key], p) ?? 0
  const total = (list: string[], key: FlowSeries) => list.reduce((a, id) => a + flow(id, key), 0)
  const months = $derived(periodMonths(period, clock.info?.date))
  const lasts = (id: string, key: FlowSeries) => lastsMonths(data.stats[id]?.quantity, flow(id, key), months)
  const byPeriod = (list: string[], key: FlowSeries) => [...list].sort((a, b) => flow(b, key) - flow(a, key))

  // Upkeep: what construction and maintenance together use up; the product that runs out first at this rate.
  const shortest = $derived(
    [...new Set([...construction, ...maintenance])]
      .map((id) => ({
        id,
        months: lastsMonths(data.stats[id]?.quantity, flow(id, 'consumedByConstruction') + flow(id, 'consumedByMaintenance'), months),
      }))
      .filter((x): x is { id: string; months: number } => x.months !== null)
      .sort((a, b) => a.months - b.months)[0] ?? null,
  )

  // Maintenance depots: machines running a recipe that makes maintenance (not a product in the catalog), with the
  // parts each one takes.
  const depots = $derived.by(() => {
    const src = lifetime.data
    if (!src) return []
    const byRecipe = new Map<string, { machine: string; name: string; output: string; inputs: string[] }>()
    for (const [id, sides] of Object.entries(src.products)) {
      for (const row of sides.consumed.rows) {
        if (row.type !== 'recipe' || !('recipe' in row) || row.quantity <= 0) continue
        const recipe = src.names[row.recipe] ?? row.recipe
        const output = recipe.split(' → ')[1] ?? ''
        if (!/maintenance/i.test(output) && !row.machine.startsWith('MaintenanceDepot')) continue
        const key = `${row.machine}|${row.recipe}`
        const d = byRecipe.get(key) ?? { machine: row.machine, name: src.names[row.machine] ?? row.machine, output, inputs: [] }
        d.inputs.push(id)
        byRecipe.set(key, d)
      }
    }
    return [...byRecipe.values()]
  })

  const charts = $derived.by(() => {
    const h = history.data
    if (!h) return null
    return {
      labels: periodLabels(h),
      construction: stackSeries(h, construction, 'consumedByConstruction', '--series-consumed', name),
      maintenance: stackSeries(h, maintenance, 'consumedByMaintenance', '--series-consumed', name),
      recovered: stackSeries(h, recovered, 'producedByDeconstruction', '--series-produced', name),
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
      <Stat label="Construction" value={formatNumber(total(construction, 'consumedByConstruction'))}>
        {#snippet icon()}{@render swatch('bg-consumed')}{/snippet}
      </Stat>
      <Stat label="Maintenance" value={formatNumber(total(maintenance, 'consumedByMaintenance'))}>
        {#snippet icon()}{@render swatch('bg-consumed')}{/snippet}
      </Stat>
      <Stat label="Deconstruction" value={formatNumber(total(recovered, 'producedByDeconstruction'))}>
        {#snippet icon()}{@render swatch('bg-produced')}{/snippet}
      </Stat>
      <Stat
        label="Shortest supply"
        value={shortest ? formatMonths(shortest.months) : '–'}
        sub={shortest ? name(shortest.id) : 'Nothing used up'}
        href={shortest ? href.product(shortest.id) : undefined}
      />
    </StatBand>

    {#if charts}
      {@const shown = [
        { title: 'Spent on construction', series: charts.construction },
        { title: 'Spent on maintenance', series: charts.maintenance },
        { title: 'Recovered by deconstruction', series: charts.recovered },
      ].filter((c) => hasData(c.series))}
      {#if shown.length}
        <Panel title={win.title}>
          <div class="grid gap-8">
            {#each shown as c (c.title)}
              <div class="flex min-w-0 flex-col gap-2">
                <h3 class="text-sm font-medium text-ink-2">{c.title}</h3>
                <Chart ariaLabel="{c.title} per month" labels={charts.labels} series={c.series} lastInProgress={win.inProgress} />
              </div>
            {/each}
          </div>
        </Panel>
      {/if}
    {/if}

    <div class="grid items-start gap-4 xl:grid-cols-2">
      <Panel title="Construction" note={periodLabel} flush>
        <UpkeepFlowTable
          ids={byPeriod(construction, 'consumedByConstruction')}
          active={(id) => flow(id, 'consumedByConstruction') > 0}
          columns={[
            { label: 'Spent', value: (id) => formatNumber(flow(id, 'consumedByConstruction')), strong: true },
            { label: 'In stock', value: (id) => formatNumber(data.stats[id]?.quantity) },
            { label: 'Lasts', title: `At the ${periodLabel} rate`, value: (id) => formatMonths(lasts(id, 'consumedByConstruction')) },
          ]}
          spark={charts?.spark('consumedByConstruction')}
          tone="consumed"
          sparkLabel="spent on construction"
          empty="Nothing built yet."
        />
      </Panel>

      <div class="flex flex-col gap-4">
        <Panel title="Maintenance" note={periodLabel} flush>
          <UpkeepFlowTable
            ids={byPeriod(maintenance, 'consumedByMaintenance')}
          active={(id) => flow(id, 'consumedByMaintenance') > 0}
            columns={[
              { label: 'Spent', value: (id) => formatNumber(flow(id, 'consumedByMaintenance')), strong: true },
              { label: 'In stock', value: (id) => formatNumber(data.stats[id]?.quantity) },
              { label: 'Lasts', title: `At the ${periodLabel} rate`, value: (id) => formatMonths(lasts(id, 'consumedByMaintenance')) },
            ]}
            spark={charts?.spark('consumedByMaintenance')}
            tone="consumed"
            sparkLabel="spent on maintenance"
            empty="No maintenance used yet."
          />
          {#if depots.length}
            <ul class="flex flex-col gap-2 border-t border-line p-3">
              {#each depots as d (d.machine + d.output)}
                <li class="flex items-center gap-3 rounded-ui bg-surface-2 p-3">
                  <Icon id={d.machine} size={36} />
                  <div class="flex min-w-0 flex-col gap-1.5">
                    <span class="truncate text-sm font-semibold">{d.name}</span>
                    <span class="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
                      {#each d.inputs as id (id)}<span title={name(id)}><Icon {id} size={22} /></span>{/each}
                      <ArrowRight size={14} class="text-muted" aria-hidden="true" />
                      <span>{d.output}</span>
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </Panel>

        <Panel title="Deconstruction" note={periodLabel} flush>
          <UpkeepFlowTable
            ids={byPeriod(recovered, 'producedByDeconstruction')}
          active={(id) => flow(id, 'producedByDeconstruction') > 0}
            columns={[
              { label: 'Recovered', value: (id) => formatNumber(flow(id, 'producedByDeconstruction')), strong: true },
              { label: 'In stock', value: (id) => formatNumber(data.stats[id]?.quantity) },
            ]}
            spark={charts?.spark('producedByDeconstruction')}
            tone="produced"
            sparkLabel="recovered by deconstruction"
            empty="Nothing deconstructed yet."
          />
        </Panel>
      </div>
    </div>
  {/if}
</div>
