<script module lang="ts">
  export interface BuildingRow {
    id: string
    name: string
    count: number
    /** Right now. */
    now: number
    /** Average over the selected period. */
    average: number
    /** Consumers: what they asked for right now (more than `now` = short). */
    demanded?: number
    /** Last 12 completed months, oldest first. */
    trend: number[] | null
  }
</script>

<script lang="ts">
  // One side of a power or computing breakdown: the building types that generate it, or the ones that use it,
  // with what each does now, its average over the period, its share of the total and a monthly trend.
  // Phones get a card list.
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import Icon from '@/components/Icon/Icon.svelte'
  import Sparkline from '@/components/Sparkline/Sparkline.svelte'

  let {
    rows,
    format,
    tone,
    nowLabel,
    periodLabel,
    empty,
  }: {
    rows: BuildingRow[]
    format: (n: number) => string
    tone: 'produced' | 'consumed'
    nowLabel: string
    periodLabel: string
    empty: string
  } = $props()

  /** Rows shown before "Show all": the electricity side of a big colony lists 200 building types. */
  const LIMIT = 12

  // Variants that share a name (Flat lift comes in a dozen port shapes) read as one building type.
  const merged = $derived.by(() => {
    const byName = new Map<string, BuildingRow>()
    for (const r of rows) {
      const m = byName.get(r.name)
      if (!m) {
        byName.set(r.name, { ...r, trend: r.trend ? [...r.trend] : null })
        continue
      }
      m.count += r.count
      m.now += r.now
      m.average += r.average
      if (r.demanded !== undefined) m.demanded = (m.demanded ?? 0) + r.demanded
      if (r.trend) m.trend = m.trend ? m.trend.map((v, i) => v + (r.trend![i] ?? 0)) : [...r.trend]
    }
    return [...byName.values()]
  })
  const sorted = $derived([...merged].sort((a, b) => b.average - a.average || b.now - a.now))
  let showAll = $state(false)
  const shown = $derived(showAll ? sorted : sorted.slice(0, LIMIT))
  const total = $derived(rows.reduce((a, r) => a + r.average, 0))
  const share = (r: BuildingRow) => (total > 0 ? r.average / total : 0)
  const short = (r: BuildingRow) => (r.demanded ?? 0) - r.now
</script>

{#snippet name(r: BuildingRow)}
  <span class="flex min-w-0 items-center gap-2 font-medium">
    <Icon id={r.id} size={22} />
    <span class="max-w-56 truncate" title={r.name}>{r.name}</span>
    {#if r.count > 1}<span class="text-muted tabular-nums">×{r.count}</span>{/if}
  </span>
{/snippet}

{#snippet nowCell(r: BuildingRow)}
  {#if short(r) > 0.5}
    <span class="inline-flex items-center gap-1.5" title="Asks for {format(r.demanded ?? 0)}, gets {format(r.now)}">
      <TriangleAlert size={15} class="flex-none text-warning" aria-hidden="true" />{format(r.now)}
    </span>
  {:else}
    {format(r.now)}
  {/if}
{/snippet}

{#snippet shareBar(r: BuildingRow)}
  <div class="flex items-center gap-2">
    <div class="h-2 w-20 overflow-hidden rounded-full bg-surface-2">
      <div class="h-full" style:width="{share(r) * 100}%" style:background="var(--series-{tone})"></div>
    </div>
    <span class="w-9 text-right text-2xs text-muted tabular-nums">{Math.round(share(r) * 100)}%</span>
  </div>
{/snippet}

{#if rows.length === 0}
  <p class="p-4 text-sm text-muted">{empty}</p>
{:else}
  <div class="overflow-x-auto max-md:hidden">
    <table class="data-table">
      <thead>
        <tr>
          <th class="pl-4">Building</th>
          <th class="num">{nowLabel}</th>
          <th class="num" title="Average, {periodLabel}">Average</th>
          <th>Share</th>
          <th class="grow pr-4">Trend</th>
        </tr>
      </thead>
      <tbody>
        {#each shown as r (r.name)}
          <tr class="last:[&>td]:border-b-0">
            <td class="pl-4">{@render name(r)}</td>
            <td class="num">{@render nowCell(r)}</td>
            <td class="num font-semibold">{format(r.average)}</td>
            <td>{@render shareBar(r)}</td>
            <td class="grow pr-4">
              {#if r.trend}<Sparkline fluid label="{r.name}: per month" series={[{ values: r.trend, tone }]} />{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <ul class="md:hidden">
    {#each shown as r (r.name)}
      <li class="flex flex-col gap-2 border-b border-line px-3 py-3 last:border-b-0">
        <div class="flex items-center justify-between gap-3">
          {@render name(r)}
          {#if r.trend}<Sparkline width={80} height={30} label="{r.name}: per month" series={[{ values: r.trend, tone }]} />{/if}
        </div>
        <dl class="grid grid-cols-3 items-end gap-x-3">
          <div class="flex min-w-0 flex-col">
            <dt class="truncate text-xs text-ink-2">{nowLabel}</dt>
            <dd class="text-base font-semibold tabular-nums">{@render nowCell(r)}</dd>
          </div>
          <div class="flex min-w-0 flex-col">
            <dt class="truncate text-xs text-ink-2">Average</dt>
            <dd class="text-base font-semibold tabular-nums">{format(r.average)}</dd>
          </div>
          <div class="flex min-w-0 flex-col gap-1.5">
            <dt class="truncate text-xs text-ink-2">Share</dt>
            <dd>{@render shareBar(r)}</dd>
          </div>
        </dl>
      </li>
    {/each}
  </ul>
  {#if sorted.length > LIMIT}
    <button
      type="button"
      class="w-full cursor-pointer border-t border-line px-4 py-2 text-left text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
      aria-expanded={showAll}
      onclick={() => (showAll = !showAll)}
    >
      {showAll ? `Show the top ${LIMIT}` : `Show all ${sorted.length}`}
    </button>
  {/if}
{/if}
