<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import type { FlowPeriod } from '@/logic/api/types'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import { api, ApiError } from '@/logic/api/client'
  import { addPeriods, parseGameDate } from '@/logic/api/gameDate'
  import type { UnityCategory, UnityHistoryResponse, UnityRecord, UnityResolution } from '@/logic/api/types'
  import Chart, { type ChartSeries } from '@/components/Chart/Chart.svelte'
  import Icon from '@/components/Icon/Icon.svelte'
  import PageHeader from '@/components/PageHeader/PageHeader.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import Sparkline from '@/components/Sparkline/Sparkline.svelte'
  import StatBand from '@/components/StatBand/StatBand.svelte'
  import Stat from '@/components/StatBand/Stat.svelte'
  import { topSeries } from '@/lib/topSeries'
  import { getClock } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'

  // Unity: what the colony generates and spends, per category, from the game's own Unity stats. The game's
  // /api/v1 has none of this; it comes from the ControlRoom mod (/api/mods/control-room/unity).
  const clock = getClock()

  // The app-wide period. The game's Unity stats have no "this month"; that one comes from its this-month ledger.
  const period = $derived(globalPeriod.value)
  const periodLabel = $derived(globalPeriod.label)

  // ---- numbers: Unity runs in fractions (0.25 a lab), so keep two decimals ----
  const nf = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '–' : nf.format(Math.abs(n) < 0.005 ? 0 : n))
  const signed = (n: number) => (n >= 0.005 ? '+' : '') + fmt(n)
  const netClass = (n: number) => (n >= 0.005 ? 'text-pos' : n <= -0.005 ? 'text-neg' : '')

  const MOD_MISSING =
    "Unity data comes from the Control Room mod, which this game hasn't loaded. Install it (make install) and restart the game."
  async function fromMod<T>(load: () => Promise<T>): Promise<T> {
    try {
      return await load()
    } catch (e) {
      throw e instanceof ApiError && e.status === 404 ? new Error(MOD_MISSING) : e
    }
  }

  // ---- data ----
  const unity = new LiveResource(clock, () => null, (_, signal) => fromMod(() => api.unity(signal)))

  // Charts follow the period: the last 12 months, last year's 12 months, or every year for lifetime. History series
  // start with the newest completed period, so "last year" skips this year's completed months first.
  const today = $derived(clock.info ? parseGameDate(clock.info.date) : null)
  interface Window {
    resolution: UnityResolution
    skip: number
    take: number
    title: string
    /** Label of the period `i` steps back (0 = newest completed). */
    label: (i: number) => string
  }
  const win: Window | null = $derived.by(() => {
    if (!today) return null
    const monthStart = { year: today.year, month: today.month, day: 1 }
    const monthLabel = (i: number) => {
      const d = addPeriods(monthStart, 'month', -(i + 1))
      return `Y${d.year} M${d.month}`
    }
    if (period === 'lifetime' && today.year > 1) {
      return { resolution: 'years', skip: 0, take: today.year - 1, title: 'All years', label: (i) => `Y${today.year - 1 - i}` }
    }
    if (period === 'lastYear') {
      return { resolution: 'months', skip: today.month - 1, take: 12, title: `Y${today.year - 1}`, label: monthLabel }
    }
    return { resolution: 'months', skip: 0, take: 12, title: 'Last 12 months', label: monthLabel }
  })
  const history = new LiveResource(
    clock,
    () => (win ? `${win.resolution}:${Math.min(1000, win.skip + win.take)}` : null),
    async (key, signal) => {
      if (!key) return null
      const [resolution, count] = key.split(':')
      return fromMod(() => api.unityHistory(resolution as UnityResolution, Number(count), signal))
    },
  )
  // Sparklines always show the last 12 completed months, whatever the period.
  const monthly = new LiveResource(clock, () => null, (_, signal) => fromMod(() => api.unityHistory('months', 12, signal)))

  // ---- categories ----
  /** The game's "Ignore" bucket stays out of every total, as in its own Unity window. */
  const counted = $derived((unity.data?.categories ?? []).filter((c) => !c.ignoreInStats))
  /**
   * Per stats category: this month's Unity, from the game's this-month ledger (the itemized records). Unity is booked
   * monthly, so there is no daily history to sum.
   */
  const thisMonth = $derived.by(() => {
    const out = new Map<string, { generated: number; consumed: number }>()
    for (const r of unity.data?.thisMonth ?? []) {
      const key = r.statsCategory ?? r.category
      const v = out.get(key) ?? { generated: 0, consumed: 0 }
      if (r.exchanged > 0) v.generated += r.exchanged
      else v.consumed -= r.exchanged
      out.set(key, v)
    }
    return out
  })
  const generated = (c: UnityCategory, p: FlowPeriod = period) =>
    p === 'thisMonth' ? (thisMonth.get(c.id)?.generated ?? 0) : (c.generated?.[p] ?? 0)
  const spent = (c: UnityCategory, p: FlowPeriod = period) =>
    p === 'thisMonth' ? (thisMonth.get(c.id)?.consumed ?? 0) : (c.consumed?.[p] ?? 0)
  const sum = (values: number[]) => values.reduce((a, v) => a + v, 0)

  const sources = $derived(counted.filter((c) => generated(c) > 0).sort((a, b) => generated(b) - generated(a)))
  const uses = $derived(counted.filter((c) => spent(c) > 0).sort((a, b) => spent(b) - spent(a)))
  /** Categories active in the period: generators first (largest first), then the ones that only spend. */
  const active = $derived([...sources, ...uses.filter((c) => !sources.includes(c))])
  const totalGenerated = $derived(sum(sources.map((c) => generated(c))))
  const totalSpent = $derived(sum(uses.map((c) => spent(c))))
  const categoryName = $derived(new Map((unity.data?.categories ?? []).map((c) => [c.id, c.name])))

  // ---- this month's ledger: identical lines (two basic research labs) merged ----
  interface Line {
    key: string
    title: string
    icon: string | null
    category: string
    count: number
    exchanged: number
    possible: number
    /** Unity a need could give but doesn't (possible − got), 0 for spending lines. */
    missing: number
  }
  const ledger: Line[] = $derived.by(() => {
    const lines = new Map<string, Line>()
    for (const r of unity.data?.thisMonth ?? ([] as UnityRecord[])) {
      const category = categoryName.get(r.statsCategory ?? r.category) ?? r.statsCategory ?? r.category
      const title = r.title ?? category
      const key = `${title}|${category}|${Math.sign(r.exchanged)}`
      const line = lines.get(key) ?? { key, title, icon: r.icon ?? null, category, count: 0, exchanged: 0, possible: 0, missing: 0 }
      line.count++
      line.exchanged += r.exchanged
      line.possible += r.possibleMax
      if (r.possibleMax > 0) line.missing += Math.max(0, r.possibleMax - r.exchanged)
      lines.set(key, line)
    }
    return [...lines.values()].sort((a, b) => b.exchanged - a.exchanged)
  })
  const produced = $derived(ledger.filter((l) => l.exchanged > 0))
  /** Spending lines, largest first, as positive amounts. */
  const consumed = $derived(
    ledger.filter((l) => l.exchanged < 0).map((l) => ({ ...l, exchanged: -l.exchanged })).sort((a, b) => b.exchanged - a.exchanged),
  )
  const missing = $derived(ledger.filter((l) => l.missing >= 0.005).sort((a, b) => b.missing - a.missing))
  const totalMissing = $derived(sum(missing.map((l) => l.missing)))

  // ---- charts: one series per active category, entity colors (slots 3+) ----
  function rowsOf(h: UnityHistoryResponse, w: Window, key: 'generated' | 'consumed') {
    return h.categories
      .filter((c) => !c.ignoreInStats)
      .map((c) => ({ name: c.name, values: (c[key] ?? []).slice(w.skip, w.skip + w.take).reverse() }))
      .filter((r) => r.values.some((v) => v > 0))
  }
  const toSeries = (rows: { name: string; values: number[] }[], from: number, single: string): ChartSeries[] =>
    topSeries(rows.map((r) => ({ label: r.name, values: r.values.slice(from) })), single)
  const charts = $derived.by(() => {
    const h = history.data
    const w = win
    if (!h || !w || h.resolution !== w.resolution) return null
    const gen = rowsOf(h, w, 'generated')
    const spent = rowsOf(h, w, 'consumed')
    const n = Math.max(0, ...[...gen, ...spent].map((r) => r.values.length))
    // Lifetime asks for every year since Y1: drop the empty years before the save began (keep one for context).
    let from = 0
    if (w.resolution === 'years') {
      const first = Array.from({ length: n }, (_, i) => i).find((i) => [...gen, ...spent].some((r) => (r.values[i] ?? 0) > 0))
      from = Math.max(0, (first ?? n) - 1)
    }
    return {
      // Oldest first; w.label counts back from the newest completed period, which the data skipped `w.skip` of.
      labels: Array.from({ length: n - from }, (_, i) => w.label(w.skip + n - 1 - (i + from))),
      generated: toSeries(gen, from, '--series-produced'),
      spent: toSeries(spent, from, '--series-consumed'),
    }
  })
  const spark = $derived(new Map((monthly.data?.categories ?? []).map((c) => [c.id, c])))
  const sparkSeries = (id: string) => {
    const c = spark.get(id)
    // A category that never spends (or never generates) gets no flat zero line pretending to be data.
    return [
      { values: [...(c?.generated ?? [])].reverse(), tone: 'produced' as const },
      { values: [...(c?.consumed ?? [])].reverse(), tone: 'consumed' as const },
    ].filter((s) => s.values.some((v) => v > 0))
  }
</script>

{#snippet swatch(bg: 'bg-produced' | 'bg-consumed')}
  <span class={['h-1 w-4 flex-none rounded-full', bg]} aria-hidden="true"></span>
{/snippet}

{#snippet figure(label: string, value: string, cls = '')}
  <div class="flex min-w-0 flex-col">
    <dt class="truncate text-xs text-ink-2">{label}</dt>
    <dd class={['text-base font-semibold tabular-nums', cls]}>{value}</dd>
  </div>
{/snippet}

{#snippet missingMark(line: Line)}
  <span class="inline-flex items-center justify-end gap-1.5" title="This need could give {fmt(line.possible)} but gives {fmt(line.exchanged)}">
    <TriangleAlert size={15} class="flex-none text-warning" aria-hidden="true" />
    {fmt(line.missing)}
  </span>
{/snippet}

{#snippet lineName(line: Line, size: number)}
  <span class="flex min-w-0 items-center gap-2 font-medium">
    {#if line.icon}
      <Icon id={line.icon} {size} />
    {:else}
      <span class="inline-block flex-none" style:width="{size}px" style:height="{size}px" aria-hidden="true"></span>
    {/if}
    <span class="truncate">{line.title}</span>
    {#if line.count > 1}<span class="text-muted tabular-nums">×{line.count}</span>{/if}
  </span>
{/snippet}

{#snippet ledgerPanel(title: string, lines: Line[], producing: boolean)}
  <Panel {title} note="this month" flush>
    {#if lines.length === 0}
      <p class="p-4 text-sm text-muted">{producing ? 'Nothing produces Unity this month.' : 'Nothing consumes Unity this month.'}</p>
    {:else}
      <div class="overflow-x-auto max-md:hidden">
        <table class="data-table">
          <thead>
            <tr>
              <th class="pl-4">Item</th>
              <th>Category</th>
              <th class={['num', !producing && 'pr-4']}>Unity</th>
              {#if producing}
                <th class="num" title="With the need fully met">Possible</th>
                <th class="num pr-4">Missing</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each lines as line (line.key)}
              <tr class="last:[&>td]:border-b-0">
                <td class="pl-4">{@render lineName(line, 20)}</td>
                <td class="text-ink-2">{line.category}</td>
                <td class={['num font-semibold', !producing && 'pr-4']}>{fmt(line.exchanged)}</td>
                {#if producing}
                  <td class="num">{fmt(line.possible)}</td>
                  <td class="num pr-4">{#if line.missing >= 0.005}{@render missingMark(line)}{:else}<span class="text-muted">–</span>{/if}</td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <ul class="md:hidden">
        {#each lines as line (line.key)}
          <li class="flex flex-col gap-2 border-b border-line px-3 py-3 last:border-b-0">
            <div class="flex items-baseline justify-between gap-3">
              {@render lineName(line, 20)}
              <span class="text-xs text-ink-2">{line.category}</span>
            </div>
            <dl class="grid grid-cols-3 gap-x-3">
              {@render figure('Unity', fmt(line.exchanged))}
              {#if producing}
                {@render figure('Possible', fmt(line.possible))}
                <div class="flex min-w-0 flex-col">
                  <dt class="truncate text-xs text-ink-2">Missing</dt>
                  <dd class="text-base font-semibold tabular-nums">
                    {#if line.missing >= 0.005}{@render missingMark(line)}{:else}–{/if}
                  </dd>
                </div>
              {/if}
            </dl>
          </li>
        {/each}
      </ul>
    {/if}
  </Panel>
{/snippet}

<PageHeader title="Unity">
</PageHeader>

{#if !unity.data}
  <p class="max-w-prose text-sm text-muted">{unity.error ?? 'Loading…'}</p>
{:else}
  {@const u = unity.data}
  <div class="flex flex-col gap-4">
    <!-- The game's "net" is the current monthly rate: it equals the sum of this month's ledger, not last month's
         generated − spent (those differ when e.g. contracts vary). -->
    <StatBand>
      <Stat label="Unity" value={fmt(u.quantity)} sub={u.quantity >= u.cap - 0.005 ? `At the cap of ${fmt(u.cap)}` : `Cap ${fmt(u.cap)}`} />
      <Stat
        label="Net per month"
        value={signed(u.lastMonth.net)}
        valueClass={netClass(u.lastMonth.net)}
        sub={Math.abs(u.lastMonth.possibleNet - u.lastMonth.net) >= 0.005
          ? `Possible ${signed(u.lastMonth.possibleNet)}`
          : `${signed(u.lastMonth.netWithOneTimeActions)} with one-time actions`}
      />
      <Stat label="Production" value={fmt(totalGenerated)} sub="{sources.length} {sources.length === 1 ? 'source' : 'sources'}">
        {#snippet icon()}{@render swatch('bg-produced')}{/snippet}
      </Stat>
      <Stat label="Consumption" value={fmt(totalSpent)} sub="{uses.length} {uses.length === 1 ? 'use' : 'uses'}">
        {#snippet icon()}{@render swatch('bg-consumed')}{/snippet}
      </Stat>
      <Stat
        label="Missing"
        value={fmt(totalMissing)}
        sub={missing.length ? missing.map((l) => l.title).join(', ') : 'Every need met'}
      >
        {#snippet icon()}
          {#if missing.length}<TriangleAlert size={14} class="text-warning" aria-hidden="true" />{/if}
        {/snippet}
      </Stat>
    </StatBand>

    {#if charts && win && (charts.generated.length || charts.spent.length)}
      <Panel title={win.title}>
        <div class="grid gap-8">
          {#if charts.generated.length}
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="text-sm font-medium text-ink-2">Production</h3>
              <Chart ariaLabel="Unity production per category" labels={charts.labels} series={charts.generated} format={fmt} />
            </div>
          {/if}
          {#if charts.spent.length}
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="text-sm font-medium text-ink-2">Consumption</h3>
              <Chart ariaLabel="Unity consumption per category" labels={charts.labels} series={charts.spent} format={fmt} />
            </div>
          {/if}
        </div>
      </Panel>
    {/if}

    <div class="grid items-start gap-4 xl:grid-cols-2">
      {@render ledgerPanel('Production', produced, true)}
      {@render ledgerPanel('Consumption', consumed, false)}
    </div>

    <Panel title="By category" note={periodLabel} flush>
        {#if active.length === 0}
          <p class="p-4 text-sm text-muted">No Unity produced or consumed in this period.</p>
        {:else}
          <div class="overflow-x-auto max-md:hidden">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="pl-4">Category</th>
                  <th class="num">Produced</th>
                  <th class="num">Consumed</th>
                  <th class="num">Net</th>
                  <th class="grow pr-4">Trend</th>
                </tr>
              </thead>
              <tbody>
                {#each active as c (c.id)}
                  {@const net = generated(c) - spent(c)}
                  <tr class="last:[&>td]:border-b-0">
                    <td class="pl-4 font-medium">{c.name}</td>
                    <td class="num">{generated(c) ? fmt(generated(c)) : '–'}</td>
                    <td class="num">{spent(c) ? fmt(spent(c)) : '–'}</td>
                    <td class={['num font-semibold', netClass(net)]}>{signed(net)}</td>
                    <td class="grow pr-4">
                      {#if monthly.data}
                        <Sparkline fluid label="{c.name}: Unity produced vs consumed per month" series={sparkSeries(c.id)} />
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <ul class="md:hidden">
            {#each active as c (c.id)}
              {@const net = generated(c) - spent(c)}
              <li class="flex flex-col gap-3 border-b border-line px-3 py-3 last:border-b-0">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate font-medium">{c.name}</span>
                  {#if monthly.data}
                    <Sparkline width={80} height={30} label="{c.name}: Unity produced vs consumed per month" series={sparkSeries(c.id)} />
                  {/if}
                </div>
                <dl class="grid grid-cols-3 gap-x-3">
                  {@render figure('Produced', generated(c) ? fmt(generated(c)) : '–')}
                  {@render figure('Consumed', spent(c) ? fmt(spent(c)) : '–')}
                  {@render figure('Net', signed(net), netClass(net))}
                </dl>
              </li>
            {/each}
          </ul>
        {/if}
    </Panel>
  </div>
{/if}
