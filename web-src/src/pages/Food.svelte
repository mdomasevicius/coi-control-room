<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import { flowAt } from '@/lib/analysis'
  import { api } from '@/logic/api/client'
  import type { FlowPeriod } from '@/logic/api/types'
  import Chart, { type ChartSeries } from '@/components/Chart/Chart.svelte'
  import Sparkline from '@/components/Sparkline/Sparkline.svelte'
  import Icon from '@/components/Icon/Icon.svelte'
  import PageHeader from '@/components/PageHeader/PageHeader.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import StatBand from '@/components/StatBand/StatBand.svelte'
  import Stat from '@/components/StatBand/Stat.svelte'
  import { classify, FERTILIZER_IDS, isFarmEntity } from '@/lib/food'
  import { colorIn, topSeries } from '@/lib/topSeries'
  import { formatNumber, formatSigned } from '@/lib/format'
  import { getClock, getGameData } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'
  import { applyWindow, historyWindow, periodLabels, windowKey, sparkValues } from '@/lib/historyWindow'
  import { href } from '@/lib/router.svelte'
  import { gameSpeed } from '@/logic/gameSpeed.svelte'

  const clock = getClock()
  const data = getGameData()

  const period = $derived(globalPeriod.value)
  // Charts follow the period (see lib/historyWindow): months around it, its year, or every year.
  const win = $derived(historyWindow(period, clock.info?.date))
  const periodLabel = $derived(globalPeriod.label)

  // ---- data ----
  const extra = new LiveResource(
    clock,
    () => null,
    async (_, signal) => (await api.stats({ series: ['consumedBySettlements', 'consumedByFarms'] }, signal)).products,
  )
  const lifetime = new LiveResource(clock, () => null, (_, signal) => api.sources({ period: 'lifetime' }, signal))
  const sources = new LiveResource(
    clock,
    () => period,
    (p, signal) => api.sources({ period: p }, signal),
  )

  const groups = $derived(
    classify(
      new Set(data.products.map((p) => p.id)),
      extra.data ?? {},
      lifetime.data,
      new Map(data.products.map((p) => [p.id, p.kind])),
    ),
  )

  const history = new LiveResource(
    clock,
    () => `${[...new Set([...groups.food, ...groups.inputs])].join(',')}|${windowKey(win)}`,
    async (key, signal) => {
      const ids = key.split('|')[0]
      return ids
        ? applyWindow(
            await api.history(
              {
                ids: ids.split(','),
                series: ['produced', 'consumedBySettlements', 'consumedByFarms'],
                resolution: win.resolution,
                count: win.count,
              },
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
  const ex = (id: string) => extra.data?.[id] ?? {}
  const sum = (values: (number | null)[]) => values.reduce<number>((a, v) => a + (v ?? 0), 0)

  const eaten = (id: string, p: FlowPeriod = period) => flowAt(ex(id).consumedBySettlements, p) ?? 0
  const produced = (id: string, p: FlowPeriod = period) => flowAt(st(id).produced, p) ?? 0
  const consumed = (id: string, p: FlowPeriod = period) => flowAt(st(id).consumed, p) ?? 0
  const byFarms = (id: string, p: FlowPeriod = period) => flowAt(ex(id).consumedByFarms, p) ?? 0

  function lasts(quantity: number | undefined, perMonth: number) {
    if (!perMonth) return '–'
    const m = (quantity ?? 0) / perMonth
    return m < 1 ? `${Math.round(m * 30)} days` : `${m.toFixed(1)} mo`
  }

  const NET_CLASS = { pos: 'text-pos', neg: 'text-neg', zero: '' } as const
  const netClass = (n: number) => NET_CLASS[n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero']

  /** Water collected from rain by farms in the selected period (farms show up as water producers). */
  function rainAtFarms(id: string) {
    const rows = sources.data?.products[id]?.produced.rows ?? []
    return sum(rows.map((r) => ('entity' in r && isFarmEntity(r.entity) ? r.quantity : 0)))
  }

  // ---- totals ----
  const totalEaten = $derived(sum(groups.food.map((id) => eaten(id))))
  const totalProduced = $derived(sum(groups.food.map((id) => produced(id))))
  const totalStock = $derived(sum(groups.food.map((id) => st(id).quantity ?? 0)))
  const eatenLastMonth = $derived(sum(groups.food.map((id) => eaten(id, 'lastMonth'))))
  const typesEaten = $derived(groups.food.filter((id) => eaten(id) > 0).length)
  const hasWater = $derived(groups.inputs.includes('Product_Water'))
  const fertilizers = $derived(groups.inputs.filter((id) => FERTILIZER_IDS.includes(id)))

  // ---- charts ----
  const charts = $derived.by(() => {
    const h = history.data
    if (!h) return null
    const n = Math.max(0, ...Object.values(h.products).flatMap((p) => Object.values(p).map((v) => v?.length ?? 0)))
    const labels = periodLabels(h)
    const series = (id: string, key: 'produced' | 'consumedBySettlements' | 'consumedByFarms') =>
      h.products[id]?.[key] ?? Array(n).fill(0)
    const sumSeries = (ids: string[], key: 'produced' | 'consumedBySettlements') =>
      labels.map((_, i) => sum(ids.map((id) => series(id, key)[i] ?? 0)))

    const food = groups.food.filter((id) => h.products[id])
    const inputs = groups.inputs.filter((id) => h.products[id])
    return {
      labels,
      totals: [
        { label: 'Produced', values: sumSeries(food, 'produced'), color: '--series-produced' },
        { label: 'Consumed', values: sumSeries(food, 'consumedBySettlements'), color: '--series-consumed' },
      ] satisfies ChartSeries[],
      perFood: topSeries(food.map((id) => ({ label: name(id), values: series(id, 'consumedBySettlements') })), '--series-consumed'),
      perInput: topSeries(inputs.map((id) => ({ label: name(id), values: series(id, 'consumedByFarms') })), '--series-consumed'),
      spark: (id: string, key: 'produced' | 'consumedBySettlements' | 'consumedByFarms') => sparkValues(series(id, key), win),
    }
  })


  // ---- farm output ----
  const farmOutput = $derived.by(() => {
    const src = sources.data
    if (!src) return []
    const rows: { crop: string; farm: string; farmName: string; quantity: number; share: number }[] = []
    for (const id of groups.crops) {
      const p = src.products[id]
      if (!p) continue
      for (const r of p.produced.rows) {
        if ('entity' in r && isFarmEntity(r.entity) && r.quantity > 0) {
          rows.push({
            crop: id,
            farm: r.entity,
            farmName: src.names[r.entity] ?? r.entity,
            quantity: r.quantity,
            share: p.produced.total ? r.quantity / p.produced.total : 0,
          })
        }
      }
    }
    return rows.sort((a, b) => b.quantity - a.quantity)
  })

  const totalNet = $derived(totalProduced - totalEaten)

  const loaded = $derived(data.loaded && extra.data !== null && lifetime.data !== null)
</script>

{#snippet figure(label: string, value: string, valueClass: string = '')}
  <div class="flex min-w-0 flex-col">
    <dt class="truncate text-xs text-ink-2">{label}</dt>
    <dd class={['text-base font-semibold tabular-nums', valueClass]}>{value}</dd>
  </div>
{/snippet}

{#snippet swatch(color: string)}
  <span class="h-1 w-4 flex-none rounded-full" style:background="var({color})" aria-hidden="true"></span>
{/snippet}

{#snippet productLink(id: string)}
  <a class="group flex w-max items-center gap-2 font-medium" href={href.product(id)}>
    <Icon {id} size={22} /><span class="group-hover:underline">{name(id)}</span>
  </a>
{/snippet}

<PageHeader
  title="Food &amp; farms"
>
</PageHeader>

{#if !loaded}
  <p class="text-sm text-muted">{data.error ?? extra.error ?? lifetime.error ?? 'Loading…'}</p>
{:else}
  <div class="flex flex-col gap-4">
    <StatBand>
      <Stat label="Consumed" value={formatNumber(totalEaten)} sub="{typesEaten} of {groups.food.length} foods">
        {#snippet icon()}{@render swatch('--series-consumed')}{/snippet}
      </Stat>
      <Stat label="Produced" value={formatNumber(totalProduced)}>
        {#snippet icon()}{@render swatch('--series-produced')}{/snippet}
        {#snippet sub()}
          <span class={netClass(totalNet)}>{formatSigned(totalNet)}</span> vs consumed
        {/snippet}
      </Stat>
      <Stat label="In stock" value={formatNumber(totalStock)} />
      <Stat
        label="Lasts"
        value={eatenLastMonth ? lasts(totalStock, eatenLastMonth) : '–'}
        valueClass={eatenLastMonth ? '' : 'text-muted'}
        sub={eatenLastMonth
          ? (gameSpeed.realDurationAtSpeed(totalStock / eatenLastMonth)?.replace(/^a/, 'A') ?? "At last month's rate")
          : 'Nothing consumed last month'}
      />
      <Stat
        label="Farm water"
        value={hasWater ? formatNumber(byFarms('Product_Water')) : '–'}
        valueClass={hasWater ? '' : 'text-muted'}
        sub={hasWater ? `${formatNumber(rainAtFarms('Product_Water'))} from rain` : 'No farm uses water'}
      >
        {#snippet icon()}<Icon id="Product_Water" size={16} />{/snippet}
      </Stat>
      <Stat
        label="Fertilizer"
        value={fertilizers.length ? formatNumber(sum(fertilizers.map((id) => byFarms(id)))) : '–'}
        valueClass={fertilizers.length ? '' : 'text-muted'}
        sub={fertilizers.length ? fertilizers.map(name).join(', ') : 'Not unlocked yet'}
      />
    </StatBand>

    {#if charts}
      <Panel title={win.title}>
        <div class="grid gap-8">
          <div class="flex min-w-0 flex-col gap-2">
            <h3 class="text-xs font-medium text-ink-2">Food</h3>
            <Chart ariaLabel="Food produced and consumed per month" labels={charts.labels} series={charts.totals} lastInProgress={win.inProgress} />
          </div>
          {#if charts.perFood.length > 1}
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="text-xs font-medium text-ink-2">Consumed by type</h3>
              <Chart ariaLabel="Food consumed per month by type" labels={charts.labels} series={charts.perFood} lastInProgress={win.inProgress} />
            </div>
          {/if}
          {#if charts.perInput.length}
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="text-xs font-medium text-ink-2">Farm inputs</h3>
              <Chart ariaLabel="Farm inputs used per month" labels={charts.labels} series={charts.perInput} lastInProgress={win.inProgress} />
            </div>
          {/if}
        </div>
      </Panel>
    {/if}

    <Panel title="Food" note={periodLabel} flush>
      {#if groups.food.length === 0}
        <p class="p-4 text-sm text-muted">No food unlocked yet.</p>
      {:else}
        <div class="overflow-x-auto max-md:hidden">
          <table class="data-table">
            <thead>
              <tr>
                <th>Food</th>
                <th class="num">In stock</th>
                <th class="num">Produced</th>
                <th class="num">Consumed</th>
                <th class="num">Other uses</th>
                <th class="num">Net</th>
                <th class="num" title="At last month's eating rate">Lasts</th>
                <th>Share of diet</th>
                <th class="grow">Trend</th>
              </tr>
            </thead>
            <tbody>
              {#each groups.food as id (id)}
                {@const e = eaten(id)}
                {@const p = produced(id)}
                {@const net = p - consumed(id)}
                {@const share = totalEaten ? e / totalEaten : 0}
                <tr>
                  <td>{@render productLink(id)}</td>
                  <td class="num font-semibold">{formatNumber(st(id).quantity)}</td>
                  <td class="num">{formatNumber(p)}</td>
                  <td class="num">{formatNumber(e)}</td>
                  <td class="num text-muted">{formatNumber(consumed(id) - e)}</td>
                  <td class={['num', netClass(net)]}>{net ? formatSigned(net) : '0'}</td>
                  <td class="num">{lasts(st(id).quantity, eaten(id, 'lastMonth'))}</td>
                  <td>
                    <div class="flex items-center gap-2">
                      <div class="h-2 w-20 overflow-hidden rounded-full bg-surface-2">
                        <div
                          class="h-full transition-[width] duration-300 motion-reduce:transition-none"
                          style:width="{share * 100}%"
                          style:background="var({groups.food.length === 1 ? '--text-2' : colorIn(charts?.perFood, name(id))})"
                        ></div>
                      </div>
                      <span class="w-9 text-right text-2xs text-muted tabular-nums">{Math.round(share * 100)}%</span>
                    </div>
                  </td>
                  <td class="grow">
                    {#if charts}
                      <Sparkline
                        fluid
                        label="{name(id)}: produced vs consumed per month"
                        series={[
                          { values: charts.spark(id, 'produced'), color: 'var(--series-produced)' },
                          { values: charts.spark(id, 'consumedBySettlements'), color: 'var(--series-consumed)' },
                        ]}
                      />
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <ul class="md:hidden">
          {#each groups.food as id (id)}
            {@const e = eaten(id)}
            {@const p = produced(id)}
            {@const net = p - consumed(id)}
            {@const share = totalEaten ? e / totalEaten : 0}
            <li class="flex flex-col gap-3 border-b border-line px-3 py-3 last:border-b-0">
              <div class="flex items-center justify-between gap-3">
                {@render productLink(id)}
                {#if charts}
                  <Sparkline
                    width={80}
                    height={30}
                    label="{name(id)}: produced vs consumed per month"
                    series={[
                      { values: charts.spark(id, 'produced'), color: 'var(--series-produced)' },
                      { values: charts.spark(id, 'consumedBySettlements'), color: 'var(--series-consumed)' },
                    ]}
                  />
                {/if}
              </div>
              <dl class="grid grid-cols-3 gap-x-3 gap-y-2">
                {@render figure('In stock', formatNumber(st(id).quantity))}
                {@render figure('Produced', formatNumber(p))}
                {@render figure('Consumed', formatNumber(e))}
                {@render figure('Net', net ? formatSigned(net) : '0', netClass(net))}
                {@render figure('Lasts', lasts(st(id).quantity, eaten(id, 'lastMonth')))}
                {@render figure('Share of diet', `${Math.round(share * 100)}%`)}
              </dl>
            </li>
          {/each}
        </ul>
      {/if}
    </Panel>

    <div class="grid items-start gap-4 lg:grid-cols-2">
      <Panel title="Farm inputs" note={periodLabel} flush>
        {#if groups.inputs.length === 0}
          <p class="p-4 text-sm text-muted">No farm inputs yet.</p>
        {:else}
          <div class="overflow-x-auto max-md:hidden">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Input</th>
                  <th class="num">In stock</th>
                  <th class="num">Used</th>
                  <th class="num">Rain</th>
                  <th class="num" title="At last month's farm use">Lasts</th>
                  <th class="grow">Trend</th>
                </tr>
              </thead>
              <tbody>
                {#each groups.inputs as id (id)}
                  <tr>
                    <td>{@render productLink(id)}</td>
                    <td class="num font-semibold">{formatNumber(st(id).quantity)}</td>
                    <td class="num">{formatNumber(byFarms(id))}</td>
                    <td class="num text-muted">{id === 'Product_Water' ? formatNumber(rainAtFarms(id)) : '–'}</td>
                    <td class="num">{lasts(st(id).quantity, byFarms(id, 'lastMonth'))}</td>
                    <td class="grow">
                      {#if charts}
                        <Sparkline
                          fluid
                          label="{name(id)}: used by farms per month"
                          series={[{ values: charts.spark(id, 'consumedByFarms'), color: `var(${colorIn(charts.perInput, name(id))})` }]}
                        />
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <ul class="md:hidden">
            {#each groups.inputs as id (id)}
              <li class="flex flex-col gap-3 border-b border-line px-3 py-3 last:border-b-0">
                <div class="flex items-center justify-between gap-3">
                  {@render productLink(id)}
                  {#if charts}
                    <Sparkline
                      width={80}
                      height={30}
                      label="{name(id)}: used by farms per month"
                      series={[{ values: charts.spark(id, 'consumedByFarms'), color: `var(${colorIn(charts.perInput, name(id))})` }]}
                    />
                  {/if}
                </div>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-2">
                  {@render figure('In stock', formatNumber(st(id).quantity))}
                  {@render figure('Used by farms', formatNumber(byFarms(id)))}
                  {#if id === 'Product_Water'}{@render figure('Rain at farms', formatNumber(rainAtFarms(id)))}{/if}
                  {@render figure('Lasts', lasts(st(id).quantity, byFarms(id, 'lastMonth')))}
                </dl>
              </li>
            {/each}
          </ul>
        {/if}
      </Panel>

      <Panel title="Farm output" note={periodLabel} flush>
        {#if farmOutput.length === 0}
          <p class="p-4 text-sm text-muted">
            No harvest in this period. Farms harvest in batches, so try this year or lifetime.
          </p>
        {:else}
          <ul class="flex flex-col">
            {#each farmOutput as r (r.crop + r.farm)}
              <li class="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                <Icon id={r.crop} size={28} />
                <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div class="flex items-baseline justify-between gap-3 text-sm">
                    <a class="truncate font-medium hover:underline" href={href.product(r.crop)}>{name(r.crop)}</a>
                    <span class="num font-semibold">{formatNumber(r.quantity)}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3 text-2xs text-muted">
                    <span class="flex min-w-0 items-center gap-1.5">
                      <Icon id={r.farm} size={16} /><span class="truncate">{r.farmName}</span>
                    </span>
                    <span class="whitespace-nowrap tabular-nums">{Math.round(r.share * 100)}% of all {name(r.crop).toLowerCase()}</span>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </Panel>
    </div>
  </div>
{/if}
