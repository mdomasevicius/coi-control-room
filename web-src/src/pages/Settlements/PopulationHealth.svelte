<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import { api } from '@/logic/api/client'
  import type { FlowPeriod, PopRecord, SettlementInfo, UnityPeriod } from '@/logic/api/types'
  import Chart, { type ChartSeries } from '@/components/Chart/Chart.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import StatBand from '@/components/StatBand/StatBand.svelte'
  import Stat from '@/components/StatBand/Stat.svelte'
  import { formatNumber, formatSigned } from '@/lib/format'
  import { getClock } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'
  import { modWindow, optionalMod, windowCount, windowed } from '@/lib/modWindow'

  // Population and health, from the ControlRoom mod (the game's /api/v1 has neither): headcount, housing and the
  // problems that need action (homeless, starving, disease), what raised and lowered health last month, health over
  // time, and each settlement's needs. Without the mod this section renders nothing; the rest of the page still works.
  let { period }: { period: FlowPeriod } = $props()

  const clock = getClock()
  // The mod's stats have no "this month" per category; this month's charts show the same window as last month.
  const modPeriod = $derived<UnityPeriod>(period === 'thisMonth' ? 'lastMonth' : period)
  const win = $derived(modWindow(modPeriod, clock.info?.date))

  const pop = new LiveResource(clock, () => null, (_, signal) => optionalMod(() => api.population(signal)))
  const history = new LiveResource(
    clock,
    () => (win ? `${win.resolution}:${windowCount(win)}` : null),
    async (key, signal) => {
      if (!key) return null
      const [resolution, count] = key.split(':')
      return optionalMod(() => api.populationHistory(resolution as 'months' | 'years', Number(count), signal))
    },
  )

  const one = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
  const pct = (n: number | undefined) => (n === undefined ? '–' : `${one.format(n)}%`)
  const points = (n: number) => `${n > 0 ? '+' : ''}${one.format(n)}`

  const p = $derived(pop.data)
  /** Some game categories have no name ("HealthPointsCat_WaterNeed"): make one from the id. */
  const causeName = (r: PopRecord) =>
    r.name ||
    r.category
      .replace(/^.*?_/, '')
      .replace(/Need$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase())
  const raises = $derived((p?.health?.lastMonthRecords ?? []).filter((r) => r.change > 0).sort((a, b) => b.change - a.change))
  const lowers = $derived(
    (p?.health?.lastMonthRecords ?? []).filter((r) => r.change < 0).sort((a, b) => a.change - b.change),
  )

  // Health is a level, not a flow: each month the game adds points per cause (base, food, healthcare, water) and
  // takes points away (pollution, landfill, disease), and health is what's added minus what's taken. So the chart is
  // one line of health %. It's only drawn when its last finished month matches the game's own reading, so units
  // that don't line up (an older mod) never plot as a misleading line.
  const chart = $derived.by((): ChartSeries[] | null => {
    const h = history.data
    if (!h || !win || h.resolution !== win.resolution || !p?.health) return null
    const added = windowed(h.generated, win)
    const taken = windowed(h.consumed, win)
    const values = added.map((v, i) => v - (taken[i] ?? 0))
    const latest = (h.generated[0] ?? 0) - (h.consumed[0] ?? 0)
    if (h.resolution === 'months' && Math.abs(latest - p.health.lastMonth) > 1) return null
    return [{ label: 'Health', values, color: '--series-stock' }]
  })
  // Left out when nobody was born or lost in the window (a full colony with no free housing has no births).
  const people = $derived.by((): ChartSeries[] | null => {
    const h = history.data
    if (!h || !win || h.resolution !== win.resolution) return null
    if (![...windowed(h.born, win), ...windowed(h.lost, win)].some((v) => v > 0)) return null
    return [
      { label: 'Born', values: windowed(h.born, win), color: '--series-produced' },
      { label: 'Lost', values: windowed(h.lost, win), color: '--series-consumed' },
    ]
  })

  /** Needs a settlement doesn't fully meet: the actionable part of its needs list. */
  const unmet = (s: SettlementInfo) => s.needs.filter((n) => n.satisfiedLastMonth < 99.5).sort((a, b) => a.satisfiedLastMonth - b.satisfiedLastMonth)
  const problems = $derived((p?.homeless ?? 0) > 0 || p?.starving || (p?.starvedLastMonth ?? 0) > 0)
</script>

{#snippet recordTable(title: string, records: PopRecord[], raising: boolean)}
  <!-- A cause that could give more than it does (a need not fully met) shows how much more; when every cause is at
       its most, that column would only repeat the figure, so it's left out. -->
  {@const short = raising && records.some((r) => r.max - r.change >= 0.05)}
  <Panel {title} note="last month" flush>
    {#if records.length === 0}
      <p class="p-4 text-sm text-muted">{raising ? 'Nothing raised health last month.' : 'Nothing lowered health last month.'}</p>
    {:else}
      <table class="data-table">
        <thead>
          <tr>
            <th class="pl-4">Cause</th>
            <th class={['num', !short && 'pr-4']}>Health</th>
            {#if short}<th class="num pr-4" title="Health it would give with the need fully met">Could give</th>{/if}
            <th class="grow" aria-hidden="true"></th>
          </tr>
        </thead>
        <tbody>
          {#each records as r (r.category + r.name)}
            <tr class="last:[&>td]:border-b-0">
              <td class="pl-4 font-medium">{causeName(r)}</td>
              <td class={['num font-semibold', !short && 'pr-4', raising ? 'text-pos' : 'text-neg']}>{points(r.change)}</td>
              {#if short}
                <td class="num pr-4">
                  {#if r.max - r.change >= 0.05}
                    <span class="inline-flex items-center gap-1.5"><TriangleAlert size={15} class="text-warning" aria-hidden="true" />{points(r.max)}</span>
                  {:else}<span class="text-muted">–</span>{/if}
                </td>
              {/if}
              <td class="grow"></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </Panel>
{/snippet}

{#if p}
  <StatBand>
    {#if p.population !== undefined}
      <Stat
        label="Population"
        value={formatNumber(p.population)}
        sub={p.populationChange ? `${formatSigned(p.populationChange)} last month` : 'No change last month'}
      />
    {/if}
    {#if p.health}
      <!-- The game fills in this month's health when the month ends; last month's is the current reading. -->
      <Stat label="Health" value={pct(p.health.lastMonth)} sub="Last month" />
    {/if}
    {#if p.housing !== undefined}
      <Stat label="Free housing" value={formatNumber(p.freeHousing)} sub="of {formatNumber(p.housing)}" />
    {/if}
    {#if p.births}
      <Stat
        label="Born, lost"
        value="{formatSigned(Math.round(p.births.born.lastMonth))}, {p.births.lost.lastMonth >= 0.5 ? formatSigned(-Math.round(p.births.lost.lastMonth)) : '0'}"
        sub={p.births.growthPaused ? 'Growth paused' : 'Last month'}
      />
    {/if}
    {#if p.workers}
      <Stat
        label="Free workers"
        value={formatNumber(p.workers.freeOrMissing)}
        valueClass={p.workers.freeOrMissing < 0 ? 'text-neg' : ''}
        sub={p.workers.freeOrMissing < 0 ? 'Missing' : `${formatNumber(Math.round(p.workers.needed.lastMonth))} needed`}
      />
    {/if}
  </StatBand>

  {#if problems || p.disease}
    <!-- Only what needs action: people without a home, starving, or a disease going round. -->
    <Panel>
      <ul class="flex flex-col gap-2 text-sm">
        {#if (p.homeless ?? 0) > 0}
          <li class="flex items-center gap-2"><TriangleAlert size={16} class="flex-none text-warning" aria-hidden="true" />{formatNumber(p.homeless)} homeless</li>
        {/if}
        {#if p.starving || (p.starvedLastMonth ?? 0) > 0}
          <li class="flex items-center gap-2">
            <TriangleAlert size={16} class="flex-none text-critical" aria-hidden="true" />People are starving{#if p.starvedLastMonth}: {formatNumber(p.starvedLastMonth)} died last month{/if}
          </li>
        {/if}
        {#if p.disease}
          <li class="flex items-center gap-2">
            <TriangleAlert size={16} class="flex-none text-serious" aria-hidden="true" />
            {p.disease.name}: {pct(p.disease.mortality)} mortality, {p.disease.monthsLeft} {p.disease.monthsLeft === 1 ? 'month' : 'months'} left
          </li>
        {/if}
      </ul>
    </Panel>
  {/if}

  {#if p.health}
    <div class="grid items-start gap-4 xl:grid-cols-2">
      {@render recordTable('Raises health', raises, true)}
      {@render recordTable('Lowers health', lowers, false)}
    </div>
  {/if}

  {#if win && (chart || people)}
    <Panel title={people ? 'Health and people' : 'Health'} note={win.title}>
      <div class="grid gap-8">
        {#if chart}
          <div class="flex min-w-0 flex-col gap-2">
            <h3 class="text-sm font-medium text-ink-2">Health</h3>
            <Chart ariaLabel="Settlement health per period" labels={win.labels} series={chart} format={(n) => `${one.format(n)}%`} />
          </div>
        {/if}
        {#if people}
          <div class="flex min-w-0 flex-col gap-2">
            <h3 class="text-sm font-medium text-ink-2">Born and lost</h3>
            <Chart ariaLabel="People born and lost per period" labels={win.labels} series={people} />
          </div>
        {/if}
      </div>
    </Panel>
  {/if}

  {#if p.settlements?.length}
    <Panel title="Settlements" note="now" flush>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="pl-4">Settlement</th>
              <th class="num">People</th>
              <th class="num">Housing</th>
              <th class="num" title="Months of food in the settlement's markets">Food</th>
              <th class="num" title="Health from food variety">Health from food</th>
              <th class="num" title="Health lost to landfill">Waste</th>
              <th class="num">Hospitals</th>
              <th class="grow pr-4">Needs not met</th>
            </tr>
          </thead>
          <tbody>
            {#each p.settlements as s (s.index)}
              {@const missing = unmet(s)}
              <tr class="last:[&>td]:border-b-0">
                <td class="pl-4 font-medium">
                  <span class="inline-flex items-center gap-1.5">
                    Settlement {s.index}
                    {#if s.starving}<TriangleAlert size={15} class="text-critical" aria-label="Starving" />{/if}
                  </span>
                </td>
                <td class="num font-semibold">{formatNumber(s.population)}</td>
                <td class="num">{formatNumber(s.housing)}</td>
                <td class="num">{s.hasFoodModule ? `${formatNumber(s.monthsOfFood)} mo` : 'No market'}</td>
                <td class="num">{points(s.healthFromFood)}</td>
                <td class={['num', s.healthPenaltyFromWaste > 0 && 'text-neg']}>{s.healthPenaltyFromWaste > 0 ? points(-s.healthPenaltyFromWaste) : '–'}</td>
                <td class="num">{s.hospitals}</td>
                <td class="grow pr-4">
                  {#if missing.length === 0}
                    <span class="text-muted">All met</span>
                  {:else}
                    <span class="flex flex-wrap gap-x-4 gap-y-1">
                      {#each missing as n (n.id)}
                        <span class="inline-flex items-center gap-1.5 text-ink-2">
                          {n.name}
                          <span class="font-semibold text-ink tabular-nums">{Math.round(n.satisfiedLastMonth)}%</span>
                        </span>
                      {/each}
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Panel>
  {/if}
{/if}
