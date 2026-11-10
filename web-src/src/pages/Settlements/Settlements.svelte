<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import { flowAt } from '@/lib/analysis'
  import { api } from '@/logic/api/client'
  import type { FlowPeriod } from '@/logic/api/types'
  import Chart, { type ChartSeries } from '@/components/Chart/Chart.svelte'
  import Icon from '@/components/Icon/Icon.svelte'
  import PageHeader from '@/components/PageHeader/PageHeader.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import Sparkline from '@/components/Sparkline/Sparkline.svelte'
  import StatBand from '@/components/StatBand/StatBand.svelte'
  import Stat from '@/components/StatBand/Stat.svelte'
  import StorageBar from '@/components/StorageBar/StorageBar.svelte'
  import { topSeries } from '@/lib/topSeries'
  import { formatNumber } from '@/lib/format'
  import { getClock, getGameData } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'
  import { applyWindow, historyWindow, periodLabels, windowKey, sparkValues } from '@/lib/historyWindow'
  import { href } from '@/lib/router.svelte'
  import { classifySettlement, settlementModules } from '@/lib/settlements'
  import { gameSpeed } from '@/logic/gameSpeed.svelte'
  import PopulationHealth from './PopulationHealth.svelte'

  // What the colony's settlements consume and give back: flows tagged consumed/produced by settlements and their
  // modules, from /api/v1. Population and health come from the ControlRoom mod (PopulationHealth, on top).
  const clock = getClock()
  const data = getGameData()

  const period = $derived(globalPeriod.value)
  // Charts follow the period (see lib/historyWindow): months around it, its year, or every year.
  const win = $derived(historyWindow(period, clock.info?.date))
  const periodLabel = $derived(globalPeriod.label)

  // ---- data ----
  const flows = new LiveResource(
    clock,
    () => null,
    async (_, signal) => (await api.stats({ series: ['consumedBySettlements', 'producedBySettlements'] }, signal)).products,
  )
  const lifetime = new LiveResource(clock, () => null, (_, signal) => api.sources({ period: 'lifetime' }, signal))

  const groups = $derived(classifySettlement(new Set(data.products.map((p) => p.id)), flows.data ?? {}))
  const modules = $derived(settlementModules(lifetime.data))

  const history = new LiveResource(
    clock,
    () => `${[...groups.needs, ...groups.outputs].join(',')}|${windowKey(win)}`,
    async (key, signal) => {
      const ids = key.split('|')[0]
      return ids
        ? applyWindow(
            await api.history(
              { ids: ids.split(','), series: ['consumedBySettlements', 'producedBySettlements'], resolution: win.resolution, count: win.count },
              signal,
            ),
            win,
          )
        : null
    },
  )

  // ---- helpers ----
  const name = (id: string) => data.byId.get(id)?.name ?? id
  const st = (id: string) => data.stats[id] ?? {}
  const used = (id: string, p: FlowPeriod = period) => flowAt(flows.data?.[id]?.consumedBySettlements, p) ?? 0
  const given = (id: string, p: FlowPeriod = period) => flowAt(flows.data?.[id]?.producedBySettlements, p) ?? 0
  const sum = (values: number[]) => values.reduce((a, v) => a + v, 0)

  /** Months the stock covers at last month's settlement use. */
  function lastsMonths(id: string) {
    const perMonth = used(id, 'lastMonth')
    return perMonth ? (st(id).quantity ?? 0) / perMonth : null
  }
  /** Real time the stock lasts at the current game speed, e.g. "40 min". */
  function realLasts(id: string) {
    const m = lastsMonths(id)
    return m === null ? null : (gameSpeed.realDuration(m)?.replace(/^about /, '') ?? null)
  }
  const formatMonths = (m: number | null) => (m === null ? '–' : m < 1 ? `${Math.round(m * 30)} days` : `${m.toFixed(1)} mo`)

  // ---- totals ----
  const totalUsed = $derived(sum(groups.needs.map((id) => used(id))))
  const totalGiven = $derived(sum(groups.outputs.map((id) => given(id))))
  const shortest = $derived(
    groups.needs
      .map((id) => ({ id, months: lastsMonths(id) }))
      .filter((x): x is { id: string; months: number } => x.months !== null)
      .sort((a, b) => a.months - b.months)[0] ?? null,
  )

  // ---- charts: one stacked series per good, entity colors (slots 3+) ----
  const charts = $derived.by(() => {
    const h = history.data
    if (!h) return null
    const n = Math.max(0, ...Object.values(h.products).flatMap((p) => Object.values(p).map((v) => v?.length ?? 0)))
    const labels = periodLabels(h)
    const series = (id: string, key: 'consumedBySettlements' | 'producedBySettlements') =>
      h.products[id]?.[key] ?? Array(n).fill(0)
    const lines = (ids: string[], key: 'consumedBySettlements' | 'producedBySettlements', single: string): ChartSeries[] =>
      topSeries(ids.map((id) => ({ label: name(id), values: series(id, key) })), single)
    return {
      labels,
      needs: lines(groups.needs, 'consumedBySettlements', '--series-consumed'),
      outputs: lines(groups.outputs, 'producedBySettlements', '--series-produced'),
      spark: (id: string, key: 'consumedBySettlements' | 'producedBySettlements') => sparkValues(series(id, key), win),
    }
  })
</script>

{#snippet productLink(id: string)}
  <a class="group flex w-max max-w-full items-center gap-2 font-medium text-ink" href={href.product(id)}>
    <Icon {id} size={24} />
    <span class="truncate group-hover:underline">{name(id)}</span>
  </a>
{/snippet}

{#snippet figure(label: string, value: string, note?: string | null)}
  <div class="flex min-w-0 flex-col">
    <dt class="truncate text-xs text-ink-2">{label}</dt>
    <dd class="text-base font-semibold tabular-nums">{value}</dd>
    {#if note}<dd class="text-2xs text-muted tabular-nums">{note}</dd>{/if}
  </div>
{/snippet}

{#snippet swatch(bg: 'bg-produced' | 'bg-consumed')}
  <span class={['h-1 w-4 flex-none rounded-full', bg]} aria-hidden="true"></span>
{/snippet}

<PageHeader title="Settlements">
</PageHeader>

<!-- Population and health from the ControlRoom mod; renders nothing without it (the wrapper then collapses). -->
<div class="mb-4 flex flex-col gap-4 empty:hidden"><PopulationHealth {period} /></div>

{#if !flows.data}
  <p class="text-sm text-muted">{flows.error ?? 'Loading…'}</p>
{:else}
  <div class="flex flex-col gap-4">
    <StatBand>
      <Stat label="Consumption" value={formatNumber(totalUsed)} sub="{groups.needs.length} {groups.needs.length === 1 ? 'kind' : 'kinds'}">
        {#snippet icon()}{@render swatch('bg-consumed')}{/snippet}
      </Stat>
      <Stat label="Production" value={formatNumber(totalGiven)} sub="{groups.outputs.length} {groups.outputs.length === 1 ? 'kind' : 'kinds'}">
        {#snippet icon()}{@render swatch('bg-produced')}{/snippet}
      </Stat>
      <Stat
        label="Shortest supply"
        value={shortest ? formatMonths(shortest.months) : '–'}
        sub={shortest
          ? [name(shortest.id), gameSpeed.realDurationAtSpeed(shortest.months)].filter(Boolean).join(', ')
          : 'Nothing is being used up'}
        href={shortest ? href.product(shortest.id) : undefined}
      />
      <Stat label="Modules" value={String(modules.length)} sub={modules.length ? undefined : 'None seen yet'} />
    </StatBand>

    {#if charts && (charts.needs.length || charts.outputs.length)}
      <Panel title={win.title}>
        <div class="grid gap-8">
          {#if charts.needs.length}
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="text-sm font-medium text-ink-2">Consumption</h3>
              <Chart ariaLabel="Goods used by settlements per month" labels={charts.labels} series={charts.needs} lastInProgress={win.inProgress} />
            </div>
          {/if}
          {#if charts.outputs.length}
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="text-sm font-medium text-ink-2">Production</h3>
              <Chart ariaLabel="Products produced by settlements per month" labels={charts.labels} series={charts.outputs} lastInProgress={win.inProgress} />
            </div>
          {/if}
        </div>
      </Panel>
    {/if}

    <div class="grid items-start gap-4 xl:grid-cols-2">
      <Panel title="Needs" note={periodLabel} flush>
        {#if groups.needs.length === 0}
          <p class="p-4 text-sm text-muted">Settlements haven't used anything yet.</p>
        {:else}
          <div class="overflow-x-auto max-md:hidden">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="pl-4">Good</th>
                  <th class="num">In stock</th>
                  <th class="num">Used</th>
                  <th class="num" title="At last month's settlement use">Lasts</th>
                  <th class="grow pr-4">Trend</th>
                </tr>
              </thead>
              <tbody>
                {#each groups.needs as id (id)}
                  <tr class="last:[&>td]:border-b-0">
                    <td class="pl-4">{@render productLink(id)}</td>
                    <td class="num font-semibold">{formatNumber(st(id).quantity)}</td>
                    <td class="num">{formatNumber(used(id))}</td>
                    <td class="num">
                      {formatMonths(lastsMonths(id))}
                      {#if realLasts(id)}<span class="block text-2xs text-muted">{realLasts(id)}</span>{/if}
                    </td>
                    <td class="grow pr-4">
                      {#if charts}
                        <Sparkline fluid label="{name(id)}: used by settlements per month" series={[{ values: charts.spark(id, 'consumedBySettlements'), tone: 'consumed' }]} />
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <ul class="md:hidden">
            {#each groups.needs as id (id)}
              <li class="flex flex-col gap-3 border-b border-line px-3 py-3 last:border-b-0">
                <div class="flex items-center justify-between gap-3">
                  {@render productLink(id)}
                  {#if charts}
                    <Sparkline width={80} height={30} label="{name(id)}: used by settlements per month" series={[{ values: charts.spark(id, 'consumedBySettlements'), tone: 'consumed' }]} />
                  {/if}
                </div>
                <dl class="grid grid-cols-3 gap-x-3">
                  {@render figure('In stock', formatNumber(st(id).quantity))}
                  {@render figure('Used', formatNumber(used(id)))}
                  {@render figure('Lasts', formatMonths(lastsMonths(id)), realLasts(id))}
                </dl>
              </li>
            {/each}
          </ul>
        {/if}
      </Panel>

      <Panel title="Output" note={periodLabel} flush>
        {#if groups.outputs.length === 0}
          <p class="p-4 text-sm text-muted">Settlements haven't given anything back yet.</p>
        {:else}
          <div class="overflow-x-auto max-md:hidden">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="pl-4">Product</th>
                  <th class="num">Produced</th>
                  <th class="num">In stock</th>
                  <th>Storage</th>
                  <th class="grow pr-4">Trend</th>
                </tr>
              </thead>
              <tbody>
                {#each groups.outputs as id (id)}
                  <tr class="last:[&>td]:border-b-0">
                    <td class="pl-4">{@render productLink(id)}</td>
                    <td class="num font-semibold">{formatNumber(given(id))}</td>
                    <td class="num">{formatNumber(st(id).quantity)}</td>
                    <td><StorageBar productId={id} stored={st(id).stored} capacity={st(id).storageCapacity} /></td>
                    <td class="grow pr-4">
                      {#if charts}
                        <Sparkline fluid label="{name(id)}: produced by settlements per month" series={[{ values: charts.spark(id, 'producedBySettlements'), tone: 'produced' }]} />
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <ul class="md:hidden">
            {#each groups.outputs as id (id)}
              <li class="flex flex-col gap-3 border-b border-line px-3 py-3 last:border-b-0">
                <div class="flex items-center justify-between gap-3">
                  {@render productLink(id)}
                  {#if charts}
                    <Sparkline width={80} height={30} label="{name(id)}: produced by settlements per month" series={[{ values: charts.spark(id, 'producedBySettlements'), tone: 'produced' }]} />
                  {/if}
                </div>
                <dl class="grid grid-cols-3 items-end gap-x-3">
                  {@render figure('Produced', formatNumber(given(id)))}
                  {@render figure('In stock', formatNumber(st(id).quantity))}
                  <div class="flex flex-col gap-1.5">
                    <dt class="text-xs text-ink-2">Storage</dt>
                    <dd><StorageBar productId={id} stored={st(id).stored} capacity={st(id).storageCapacity} width="100%" /></dd>
                  </div>
                </dl>
              </li>
            {/each}
          </ul>
        {/if}
      </Panel>
    </div>

    {#if modules.length}
      <Panel title="Modules">
        <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {#each modules as m (m.entity)}
            <li class="flex items-center gap-3 rounded-ui bg-surface-2 p-3">
              <Icon id={m.entity} size={36} />
              <div class="flex min-w-0 flex-col gap-1.5">
                <span class="truncate text-sm font-semibold">{m.name}</span>
                <span class="flex flex-wrap items-center gap-1.5">
                  {#each m.consumes as id (id)}<span title="Takes {name(id)}"><Icon {id} size={22} /></span>{/each}
                  {#if m.consumes.length && m.produces.length}<ArrowRight size={14} class="text-muted" aria-hidden="true" />{/if}
                  {#each m.produces as id (id)}<span title="Gives {name(id)}"><Icon {id} size={22} /></span>{/each}
                </span>
              </div>
            </li>
          {/each}
        </ul>
      </Panel>
    {/if}
  </div>
{/if}
