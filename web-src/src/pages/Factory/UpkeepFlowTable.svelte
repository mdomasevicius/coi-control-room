<script module lang="ts">
  export interface FlowColumn {
    label: string
    /** Header tooltip, for figures that need one. */
    title?: string
    value: (id: string) => string
    strong?: boolean
  }
</script>

<script lang="ts">
  // Per-product table for the Construction & upkeep, Waste & dumping and Mining & fuel tabs: product, figures,
  // optional buildings (from sources) and storage, and a monthly trend. Phones get a card list instead.
  import Icon from '@/components/Icon/Icon.svelte'
  import Sparkline from '@/components/Sparkline/Sparkline.svelte'
  import StorageBar from '@/components/StorageBar/StorageBar.svelte'
  import Tooltip from '@/components/Tooltip/Tooltip.svelte'
  import { uniqueBuildings, type Handler } from '@/lib/factoryFlows'
  import { getGameData } from '@/lib/live/context'
  import { href } from '@/lib/router.svelte'

  let {
    ids,
    columns,
    buildings,
    buildingsLabel = 'Buildings',
    storage = false,
    spark,
    tone,
    sparkLabel,
    empty,
    active,
  }: {
    ids: string[]
    columns: FlowColumn[]
    buildings?: (id: string) => Handler[]
    buildingsLabel?: string
    storage?: boolean
    spark?: (id: string) => number[] | null
    tone: 'produced' | 'consumed'
    sparkLabel: string
    empty: string
    /** Rows that moved in the period. The others (all-zero rows) are folded away behind a "Show N unused" toggle. */
    active?: (id: string) => boolean
  } = $props()

  let showUnused = $state(false)
  const unused = $derived(active ? ids.filter((id) => !active(id)).length : 0)
  const shown = $derived(active && !showUnused ? ids.filter(active) : ids)

  const data = getGameData()
  /** Building icons shown in a row before "+N". */
  const BUILDING_ICONS = 5
  const name = (id: string) => data.byId.get(id)?.name ?? id
  const st = (id: string) => data.stats[id] ?? {}
  // One entry per building, its recipes listed in the tooltip.
  const buildingsOf = (id: string) => {
    const list = buildings?.(id) ?? []
    return uniqueBuildings([list]).map((b) => ({
      ...b,
      recipes: list.filter((h) => b.ids.includes(h.id) && h.recipe).map((h) => h.recipe).join('\n') || undefined,
    }))
  }
</script>

{#snippet productLink(id: string)}
  <a class="group flex w-max max-w-full items-center gap-2 font-medium text-ink" href={href.product(id)}>
    <Icon {id} size={24} />
    <span class="truncate group-hover:underline">{name(id)}</span>
  </a>
{/snippet}

{#snippet trend(id: string, width: number, height: number, fluid = false)}
  {@const values = spark?.(id)}
  {#if values}
    <Sparkline {width} {height} {fluid} label="{name(id)}: {sparkLabel} per month" series={[{ values, tone }]} />
  {/if}
{/snippet}

{#snippet buildingList(list: ReturnType<typeof buildingsOf>)}
  <!-- One building reads fine by name; more become a row of icons (names on hover) so the row keeps one line. -->
  {#if list.length === 0}
    <span class="text-muted">–</span>
  {:else if list.length === 1}
    <span class="flex min-w-0 items-center gap-2" title={list[0].recipes}>
      <Icon id={list[0].id} size={22} />
      <span class="truncate text-xs text-ink-2">{list[0].name}</span>
    </span>
  {:else}
    <Tooltip align="start">
      {#snippet trigger(tipId)}
        <button type="button" class="flex cursor-default items-center gap-1 rounded-ui" aria-label="{list.length} buildings" aria-describedby={tipId}>
          {#each list.slice(0, BUILDING_ICONS) as b (b.id)}<Icon id={b.id} size={22} />{/each}
          {#if list.length > BUILDING_ICONS}<span class="pl-0.5 text-xs text-muted tabular-nums">+{list.length - BUILDING_ICONS}</span>{/if}
        </button>
      {/snippet}
      <ul class="flex flex-col gap-0.5 text-left">
        {#each list as b (b.id)}<li class="whitespace-nowrap">{b.name}</li>{/each}
      </ul>
    </Tooltip>
  {/if}
{/snippet}

{#if ids.length === 0}
  <p class="p-4 text-sm text-muted">{empty}</p>
{:else if shown.length}
  <div class="overflow-x-auto max-md:hidden">
    <table class="data-table">
      <thead>
        <tr>
          <th class="pl-4">Product</th>
          {#each columns as c (c.label)}<th class="num" title={c.title}>{c.label}</th>{/each}
          {#if buildings}<th>{buildingsLabel}</th>{/if}
          {#if storage}<th>Storage</th>{/if}
          {#if spark}<th class="grow pr-4">Trend</th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each shown as id (id)}
          <tr class="last:[&>td]:border-b-0">
            <td class="pl-4">{@render productLink(id)}</td>
            {#each columns as c (c.label)}<td class={['num', c.strong && 'font-semibold']}>{c.value(id)}</td>{/each}
            {#if buildings}<td>{@render buildingList(buildingsOf(id))}</td>{/if}
            {#if storage}<td><StorageBar productId={id} stored={st(id).stored} capacity={st(id).storageCapacity} /></td>{/if}
            {#if spark}<td class="grow pr-4">{@render trend(id, 96, 26, true)}</td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <ul class="md:hidden">
    {#each shown as id (id)}
      {@const list = buildingsOf(id)}
      <li class="flex flex-col gap-3 border-b border-line px-3 py-3 last:border-b-0">
        <div class="flex items-center justify-between gap-3">
          {@render productLink(id)}
          {@render trend(id, 80, 30)}
        </div>
        <dl class="grid grid-cols-3 items-end gap-x-3 gap-y-2">
          {#each columns as c (c.label)}
            <div class="flex min-w-0 flex-col">
              <dt class="truncate text-xs text-ink-2">{c.label}</dt>
              <dd class="text-base font-semibold tabular-nums">{c.value(id)}</dd>
            </div>
          {/each}
          {#if storage}
            <div class="flex flex-col gap-1.5">
              <dt class="text-xs text-ink-2">Storage</dt>
              <dd><StorageBar productId={id} stored={st(id).stored} capacity={st(id).storageCapacity} width="100%" /></dd>
            </div>
          {/if}
        </dl>
        {#if list.length}
          <div class="flex items-center gap-2">
            <span class="text-xs text-ink-2">{buildingsLabel}</span>
            {@render buildingList(list)}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<!-- Below the rows, or on its own when every row is folded away. -->
{#if ids.length && unused}
  <button
    type="button"
    class={['w-full cursor-pointer px-4 py-2 text-left text-xs text-ink-2 hover:bg-surface-2 hover:text-ink', shown.length && 'border-t border-line']}
    aria-expanded={showUnused}
    onclick={() => (showUnused = !showUnused)}
  >
    {showUnused ? `Hide ${unused} unused` : `Show ${unused} unused`}{#if !shown.length}<span class="text-muted">: all at 0 in this period</span>{/if}
  </button>
{/if}
