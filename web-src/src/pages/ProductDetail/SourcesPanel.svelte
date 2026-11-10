<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import Box from '@lucide/svelte/icons/box'
  import Flame from '@lucide/svelte/icons/flame'
  import Hammer from '@lucide/svelte/icons/hammer'
  import Puzzle from '@lucide/svelte/icons/puzzle'
  import Ship from '@lucide/svelte/icons/ship'
  import { api } from '@/logic/api/client'
  import type { SourceRow } from '@/logic/api/types'
  import Icon from '@/components/Icon/Icon.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import RecipeIcons from '@/components/RecipeIcons/RecipeIcons.svelte'
  import { formatNumber } from '@/lib/format'
  import { getClock } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'

  let { id }: { id: string } = $props()

  const clock = getClock()

  const period = $derived(globalPeriod.value)

  const sources = new LiveResource(
    clock,
    () => ({ id, period }),
    (p, signal) => api.sources({ ids: [p.id], period: p.period }, signal),
  )

  const ROW_NAMES: Record<string, string> = {
    import: 'Import',
    fuel: 'Fuel',
    export: 'Export',
    construction: 'Construction',
    unknown: 'Removed mods',
  }
  // Generic marks for rows that have no machine or entity icon.
  const ROW_ICONS: Record<string, typeof Box> = { import: Ship, export: Ship, fuel: Flame, construction: Hammer, unknown: Puzzle }

  // Each side of the flow, with its series color (full class names for Tailwind).
  const SIDES = [
    { side: 'produced', title: 'Produced by', bar: 'bg-produced' },
    { side: 'consumed', title: 'Consumed by', bar: 'bg-consumed' },
  ] as const

  function describe(row: SourceRow, names: Record<string, string>) {
    if (row.type === 'recipe' && 'recipe' in row)
      return { icon: row.machine, title: names[row.machine] ?? row.machine, recipe: names[row.recipe] ?? row.recipe }
    if (row.type === 'entity' && 'entity' in row) return { icon: row.entity, title: names[row.entity] ?? row.entity, recipe: '' }
    return { icon: null, title: ROW_NAMES[row.type] ?? row.type, recipe: '' }
  }

  // Same column template on both sides, so bars, amounts and shares line up across every row and both lists:
  // icon | name + recipe | bar | amount | share. On phones the bar drops to its own line under the name.
  const ROW_GRID =
    'grid grid-cols-[2rem_minmax(0,1fr)_3.5rem_2.75rem] items-center gap-x-3 sm:grid-cols-[2rem_minmax(0,1fr)_minmax(3rem,8rem)_3.5rem_2.75rem]'
</script>

<Panel title="Sources and uses" note={globalPeriod.label}>
  {#if sources.data && sources.dataParams?.id === id}
    {@const src = sources.data.products[id]}
    {@const names = sources.data.names}
    <div class="grid gap-x-10 gap-y-6 xl:grid-cols-2">
      {#each SIDES as { side, title, bar } (side)}
        {@const block = src?.[side]}
        <div class="flex min-w-0 flex-col">
          <h3 class={[ROW_GRID, 'border-b border-line pb-2 text-sm font-medium text-ink-2']}>
            <span class="col-span-2 sm:col-span-3">{title}</span>
            <span class="text-right font-semibold text-ink tabular-nums">{formatNumber(block?.total ?? 0)}</span>
            <span></span>
          </h3>
          {#if !block || block.rows.length === 0}
            <p class="py-3 text-sm text-muted">Nothing in this period.</p>
          {:else}
            <ul class="flex flex-col">
              {#each block.rows as row, i (i)}
                {@const d = describe(row, names)}
                {@const share = block.total ? row.quantity / block.total : 0}
                {@const RowIcon = ROW_ICONS[row.type] ?? Box}
                <li class={[ROW_GRID, 'min-h-14 border-b border-line py-2 last:border-b-0']}>
                  {#if d.icon}
                    <span class="max-sm:row-span-2 max-sm:self-start"><Icon id={d.icon} size={32} /></span>
                  {:else}
                    <span class="grid size-8 place-items-center rounded-ui bg-surface-2 text-muted max-sm:row-span-2 max-sm:self-start">
                      <RowIcon size={17} aria-hidden="true" />
                    </span>
                  {/if}
                  <div class="flex min-w-0 flex-col gap-1">
                    <span class="truncate text-sm font-medium">{d.title}</span>
                    {#if d.recipe}<RecipeIcons recipe={d.recipe} highlight={id} />{/if}
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-surface-2 max-sm:col-span-3 max-sm:col-start-2 max-sm:row-start-2 max-sm:mt-1" aria-hidden="true">
                    <div
                      class={['h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none', bar]}
                      style:width="{Math.max(share * 100, share > 0 ? 3 : 0)}%"
                    ></div>
                  </div>
                  <span class="text-right text-sm font-semibold tabular-nums">{formatNumber(row.quantity)}</span>
                  <span class="text-right text-2xs text-muted tabular-nums">{Math.round(share * 100)}%</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="text-sm text-muted">{sources.error ?? 'Loading…'}</p>
  {/if}
</Panel>
