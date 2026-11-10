<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import { applyWindow, historyWindow, periodLabels, windowKey } from '@/lib/historyWindow'
  import { flowAt, net } from '@/lib/analysis'
  import { api } from '@/logic/api/client'
  import type { Series } from '@/logic/api/types'
  import Chart, { type ChartSeries } from '@/components/Chart/Chart.svelte'
  import CsvButton from '@/components/CsvButton/CsvButton.svelte'
  import Icon from '@/components/Icon/Icon.svelte'
  import PageHeader from '@/components/PageHeader/PageHeader.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import Segmented, {} from '@/components/Segmented/Segmented.svelte'
  import StorageBar from '@/components/StorageBar/StorageBar.svelte'
  import { catColor } from '@/lib/food'
  import { formatNumber, formatSigned } from '@/lib/format'
  import { getClock, getGameData } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'
  import { href, router } from '@/lib/router.svelte'
  import { load, save } from '@/lib/storage'
  import { MAX_COMPARE } from './compare'
  import ProductPicker from './ProductPicker.svelte'

  let { ids }: { ids: string[] } = $props()

  const clock = getClock()
  const data = getGameData()

  // The URL is the state: dedupe and cap what a hand-edited link may hold.
  const chosen = $derived([...new Set(ids)].slice(0, MAX_COMPARE))
  const setChosen = (next: string[]) => router.go(href.compare(next))
  const nameOf = (id: string) => data.byId.get(id)?.name ?? id

  type Measure = 'produced' | 'consumed' | 'quantity' | 'stored'
  const MEASURES: { value: Measure; label: string; day: boolean }[] = [
    { value: 'produced', label: 'Produced', day: false },
    { value: 'consumed', label: 'Consumed', day: false },
    { value: 'quantity', label: 'Quantity', day: true },
    { value: 'stored', label: 'In storage', day: true },
  ]

  // Charts follow the app-wide period (lib/historyWindow), and the figures table shows it.
  const period = $derived(globalPeriod.value)
  const win = $derived(historyWindow(period, clock.info?.date))
  let picked = $state<Measure>(load('compare.measure', 'produced'))
  $effect(() => save('compare.measure', picked))
  const measureOptions = MEASURES.map(({ value, label }) => ({ value, label }))
  const measure = $derived(picked)

  const history = new LiveResource(
    clock,
    () => ({ key: chosen.join(','), win: windowKey(win) }),
    async (p, signal) => {
      if (!p.key) return null
      const series: Series[] = ['produced', 'consumed', 'quantity', 'stored']
      return applyWindow(await api.history({ ids: p.key.split(','), resolution: win.resolution, count: win.count, series }, signal), win)
    },
  )

  const chart = $derived.by(() => {
    const h = history.data
    const p = history.dataParams
    if (!h || !p || p.key !== chosen.join(',') || p.win !== windowKey(win)) return null
    const series: ChartSeries[] = chosen.map((id, i) => ({
      label: nameOf(id),
      values: h.products[id]?.[measure] ?? [],
      color: catColor(i),
    }))
    return { labels: periodLabels(h), series, unknown: h.unknownIds }
  })

  const measureLabel = $derived(MEASURES.find((m) => m.value === measure)!.label)
  const chartTitle = $derived(
    measure === 'produced' || measure === 'consumed'
      ? `${measureLabel} per ${win.resolution}`
      : `${measureLabel} at period end`,
  )

  const NET_CLASS = { pos: 'text-pos', neg: 'text-neg', zero: '' } as const
  const netTone = (n: number | null) => (n === null || n === 0 ? 'zero' : n > 0 ? 'pos' : 'neg')
  const signed = (n: number | null) => (n === null ? '–' : n === 0 ? '0' : formatSigned(n))

  const figuresCsv = () => ({
    header: ['Product', 'Id', 'Quantity', 'Stored', 'Storage capacity', `Produced (${globalPeriod.label})`, `Consumed (${globalPeriod.label})`, `Net (${globalPeriod.label})`],
    rows: chosen.map((id) => {
      const s = data.stats[id] ?? {}
      return [nameOf(id), id, s.quantity, s.stored, s.storageCapacity, flowAt(s.produced, period), flowAt(s.consumed, period), net(s, period)]
    }),
  })
</script>

<div class="flex flex-col gap-4">
  <PageHeader title="Compare" />

  <Panel>
    <div class="flex flex-col gap-4">
      {#if chosen.length === 0}
        <p class="text-sm text-ink-2">Pick products to overlay their history.</p>
      {/if}
      <ProductPicker {chosen} products={data.products} max={MAX_COMPARE} {nameOf} onchange={setChosen} />

      {#if chosen.length}
        <div class="flex flex-col gap-2 border-t border-line pt-4">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 class="text-sm font-semibold">{chartTitle}</h2>
            <Segmented class="ml-auto" size="sm" label="Measure" options={measureOptions} value={measure} onchange={(m) => (picked = m)} />
          </div>
          {#if chart}
            {#if chart.unknown.length}
              <p class="text-xs text-ink-2">Not in this save: {chart.unknown.join(', ')}</p>
            {/if}
            <Chart ariaLabel="Compare: {chartTitle}" labels={chart.labels} series={chart.series} lastInProgress={win.inProgress} height={260} />
          {:else}
            <p class="h-65 text-sm text-muted">{history.error ?? 'Loading…'}</p>
          {/if}
        </div>
      {/if}
    </div>
  </Panel>

  {#if chosen.length && data.loaded}
    <Panel title="Figures" note={globalPeriod.label} flush>
      {#snippet actions()}
        <CsvButton name="compare figures" label="Download current figures as CSV" table={figuresCsv} />
      {/snippet}
      <div class="max-md:hidden">
        <table class="data-table">
          <caption class="sr-only">Current figures of the compared products</caption>
          <thead>
            <tr>
              <th>Product</th>
              <th class="num">Quantity</th>
              <th>Storage</th>
              <th class="num">Produced</th>
              <th class="num">Consumed</th>
              <th class="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {#each chosen as id, i (id)}
              {@const s = data.stats[id] ?? {}}
              {@const n = net(s, period)}
              <tr>
                <td>
                  <a class="group flex w-fit items-center gap-2 font-medium text-ink" href={href.product(id)}>
                    <span class="h-1 w-4 flex-none rounded-full" style:background="var({catColor(i)})" aria-hidden="true"></span>
                    <Icon {id} size={20} />
                    <span class="group-hover:underline">{nameOf(id)}</span>
                  </a>
                </td>
                <td class="num font-semibold">{formatNumber(s.quantity)}</td>
                <td><StorageBar productId={id} stored={s.stored} capacity={s.storageCapacity} /></td>
                <td class="num">{formatNumber(flowAt(s.produced, period))}</td>
                <td class="num">{formatNumber(flowAt(s.consumed, period))}</td>
                <td class={['num', NET_CLASS[netTone(n)]]}>{signed(n)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <ul class="md:hidden" aria-label="Current figures of the compared products">
        {#each chosen as id, i (id)}
          {@const s = data.stats[id] ?? {}}
          {@const n = net(s, period)}
          <li class="flex flex-col gap-2 border-b border-line px-3 py-3 last:border-b-0">
            <div class="flex items-center gap-2">
              <span class="h-1 w-4 flex-none rounded-full" style:background="var({catColor(i)})" aria-hidden="true"></span>
              <a class="flex min-w-0 flex-1 items-center gap-2 text-base font-medium text-ink" href={href.product(id)}>
                <Icon {id} size={24} />
                <span class="truncate">{nameOf(id)}</span>
              </a>
              <span class={['text-base font-semibold tabular-nums', NET_CLASS[netTone(n)]]} title="Net">{signed(n)}</span>
            </div>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-6 text-sm text-ink-2 tabular-nums">
              <span class="font-semibold text-ink">{formatNumber(s.quantity)}</span>
              <StorageBar productId={id} stored={s.stored} capacity={s.storageCapacity} width="5rem" />
              <span class="inline-flex items-center gap-1.5" title="Produced">
                <span class="h-1 w-3 rounded-full bg-produced" aria-hidden="true"></span>{formatNumber(flowAt(s.produced, period))}
                <span class="sr-only">produced</span>
              </span>
              <span class="inline-flex items-center gap-1.5" title="Consumed">
                <span class="h-1 w-3 rounded-full bg-consumed" aria-hidden="true"></span>{formatNumber(flowAt(s.consumed, period))}
                <span class="sr-only">consumed</span>
              </span>
            </div>
          </li>
        {/each}
      </ul>
    </Panel>
  {/if}
</div>
