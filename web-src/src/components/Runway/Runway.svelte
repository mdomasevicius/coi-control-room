<script module lang="ts">
  export interface RunwayRow {
    key: string
    /** Product id for the icon. */
    icon: string
    name: string
    months: number
    href: string
    /** Why it's listed (settlements, upkeep, shrinking stock), for the tooltip. */
    reason: string
  }
</script>

<script lang="ts">
  // Time to empty as bars: how long each supply lasts at last month's use, shortest first. The scale is a square
  // root of months up to MAX_MONTHS, so days and weeks get room while a year still fits; ticks name the months.
  // Under DANGER_MONTHS the zone is shaded and the bar turns critical, with a warning icon on the value.
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import Icon from '@/components/Icon/Icon.svelte'
  import { formatMonths } from '@/lib/factoryFlows'

  let { rows }: { rows: RunwayRow[] } = $props()

  const MAX_MONTHS = 24
  const DANGER_MONTHS = 3
  const TICKS = [1, 3, 6, 12, 24]
  const pos = (m: number) => Math.sqrt(Math.min(MAX_MONTHS, Math.max(0, m)) / MAX_MONTHS) * 100
</script>

<!-- Wide: name | bar | value per row. Phones: name and value on one line, the bar under them. -->
<div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:grid-flow-row-dense sm:grid-cols-[minmax(8rem,14rem)_1fr_6rem]">
  {#each rows as r (r.key)}
    {@const danger = r.months < DANGER_MONTHS}
    <a class="group flex min-w-0 items-center gap-2 text-sm font-medium sm:col-start-1" href={r.href} title={r.reason}>
      <Icon id={r.icon} size={20} />
      <span class="truncate group-hover:underline">{r.name}</span>
    </a>
    <span
      class={['flex items-center justify-end gap-1 text-sm tabular-nums sm:col-start-3', danger ? 'font-semibold text-ink' : 'text-ink-2']}
    >
      {#if danger}<TriangleAlert size={14} class="text-critical" aria-hidden="true" />{/if}
      {r.months >= MAX_MONTHS ? `${MAX_MONTHS}+ mo` : formatMonths(r.months)}
    </span>
    <div class="relative col-span-2 mb-1.5 h-5 sm:col-span-1 sm:col-start-2 sm:mb-0" role="img" aria-label="{r.name}: lasts {formatMonths(r.months)}">
      <!-- danger zone and month ticks -->
      <div class="absolute inset-y-0 left-0 rounded-l-[3px] bg-critical/6" style:width="{pos(DANGER_MONTHS)}%"></div>
      {#each TICKS as t (t)}
        <div class="absolute inset-y-0 w-px bg-grid" style:left="{pos(t)}%"></div>
      {/each}
      <div
        class={['absolute top-1/2 left-0 h-2.5 -translate-y-1/2 rounded-r-full', danger ? 'bg-critical' : 'bg-ink-2']}
        style:width="max(3px, {pos(r.months)}%)"
      ></div>
    </div>
  {/each}
  <!-- scale, under the bar column -->
  <div class="relative col-span-2 h-4 text-2xs text-muted tabular-nums sm:col-span-1 sm:col-start-2">
    {#each TICKS as t (t)}
      <span class={['absolute whitespace-nowrap', t === MAX_MONTHS ? '-translate-x-full' : '-translate-x-1/2']} style:left="{pos(t)}%"
        >{t === MAX_MONTHS ? `${t}+` : t} mo</span
      >
    {/each}
  </div>
</div>
