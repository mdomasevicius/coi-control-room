<script lang="ts" module>
  import { fill, flowAt, KIND_LABELS, monthsLeft, net, PERIODS } from '@/lib/analysis'
  import type { FlowPeriod, Product, ProductStats } from '@/logic/api/types'
  import type { CsvTable } from '@/lib/csv'

  /** The table's figures as CSV (for a CsvButton next to the table): one row per product, raw numbers. */
  export function productCsv(products: Product[], stats: Record<string, ProductStats>, period: FlowPeriod): CsvTable {
    const p = PERIODS.find(([v]) => v === period)?.[1].toLowerCase() ?? period
    return {
      header: ['Product', 'Id', 'Kind', 'Quantity', 'Stored', 'Storage capacity', `Produced (${p})`, `Consumed (${p})`, `Net (${p})`],
      rows: products.map((x) => {
        const s = stats[x.id] ?? {}
        return [
          x.name,
          x.id,
          KIND_LABELS[x.kind] ?? x.kind,
          s.quantity,
          s.stored,
          s.storageCapacity,
          flowAt(s.produced, period),
          flowAt(s.consumed, period),
          net(s, period),
        ]
      }),
    }
  }
</script>

<script lang="ts">
  import Sparkline from '@/components/Sparkline/Sparkline.svelte'
  import { formatNumber, formatSigned } from '@/lib/format'
  import { href, router } from '@/lib/router.svelte'
  import Icon from '@/components/Icon/Icon.svelte'
  import PinButton from '@/components/PinButton/PinButton.svelte'
  import StorageBar from '@/components/StorageBar/StorageBar.svelte'
  import ArrowUp from '@lucide/svelte/icons/arrow-up'
  import ArrowDown from '@lucide/svelte/icons/arrow-down'
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down'
  import ArrowDownUp from '@lucide/svelte/icons/arrow-down-up'
  import ChevronUp from '@lucide/svelte/icons/chevron-up'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import GripVertical from '@lucide/svelte/icons/grip-vertical'

  type SortKey = 'order' | 'name' | 'kind' | 'quantity' | 'fill' | 'produced' | 'consumed' | 'net'

  let {
    products,
    stats,
    period,
    trends = null,
    showKind = false,
    defaultSort = 'order',
    caption,
    reordering = false,
    reorder,
    selectable = false,
    selected = $bindable([]),
    maxSelected = Infinity,
  }: {
    products: Product[]
    stats: Record<string, ProductStats>
    period: FlowPeriod
    /** Monthly produced/consumed per product (last 12 finished months + current). */
    trends?: Record<string, { produced?: number[]; consumed?: number[] }> | null
    showKind?: boolean
    defaultSort?: SortKey
    caption: string
    /** Reorder mode: rows in the given order, dragged by a grip or moved with up/down buttons; sorting is paused. */
    reordering?: boolean
    /** Called with the product and its new 0-based position. */
    reorder?: (id: string, newIndex: number) => void
    /** Checkbox per row (e.g. to pick products to compare); ignored while reordering. */
    selectable?: boolean
    /** Selected product ids, in the order they were picked. */
    selected?: string[]
    /** Unchecked boxes are disabled once this many are selected. */
    maxSelected?: number
  } = $props()

  const checks = $derived(selectable && !reordering)
  const selectedSet = $derived(new Set(selected))
  function toggle(id: string, on: boolean) {
    selected = on ? [...selected.filter((x) => x !== id), id] : selected.filter((x) => x !== id)
  }

  // svelte-ignore state_referenced_locally
  let sortKey = $state<SortKey>(defaultSort)
  let sortDir = $state<1 | -1>(1)

  function value(p: Product, key: SortKey): number | string {
    const s = stats[p.id] ?? {}
    switch (key) {
      case 'name':
        return p.name.toLowerCase()
      case 'kind':
        return p.kind
      case 'quantity':
        return s.quantity ?? -Infinity
      case 'fill':
        return fill(s) ?? -Infinity
      case 'produced':
        return flowAt(s.produced, period) ?? -Infinity
      case 'consumed':
        return flowAt(s.consumed, period) ?? -Infinity
      case 'net':
        return net(s, period) ?? -Infinity
      default:
        return 0
    }
  }

  // Optimistic order while reordering: moves show at once, and the next data refresh (the game's real order) resets it.
  let optimistic = $state<string[] | null>(null)
  $effect(() => {
    void products.map((p) => p.id).join(',')
    optimistic = null
  })
  let dragId = $state<string | null>(null)
  /** Insertion point while dragging, 0..rows.length (before row i; rows.length = after the last row). */
  let dropAt = $state<number | null>(null)

  function move(id: string, to: number) {
    const ids = optimistic ?? products.map((p) => p.id)
    const from = ids.indexOf(id)
    if (from === -1 || to < 0 || to >= ids.length || to === from) return
    const next = ids.filter((x) => x !== id)
    next.splice(to, 0, id)
    optimistic = next
    reorder?.(id, to)
  }

  // Top half of a row inserts before it, bottom half after it, so the end of the list is reachable too.
  function onDragOver(e: DragEvent, idx: number) {
    if (!reordering || dragId === null) return
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dropAt = e.clientY > r.top + r.height / 2 ? idx + 1 : idx
  }

  function onDrop() {
    if (dragId !== null && dropAt !== null) {
      const from = rows.findIndex((p) => p.id === dragId)
      // The game's newIndex is the final 0-based position, after the item left its old spot.
      move(dragId, dropAt > from ? dropAt - 1 : dropAt)
    }
    dragId = null
    dropAt = null
  }

  /** Show the insertion line only where the drop would actually move something. */
  const dropLine = (idx: number) => {
    if (dragId === null || dropAt === null) return null
    const from = rows.findIndex((p) => p.id === dragId)
    if (dropAt === from || dropAt === from + 1) return null
    if (dropAt === idx) return 'top'
    if (dropAt === rows.length && idx === rows.length - 1) return 'bottom'
    return null
  }

  const rows = $derived.by(() => {
    if (reordering) {
      if (!optimistic) return products
      const byId = new Map(products.map((p) => [p.id, p]))
      return optimistic.map((id) => byId.get(id)).filter((p) => p !== undefined)
    }
    if (sortKey === 'order') return products
    const key = sortKey
    return [...products].sort((a, b) => {
      const va = value(a, key)
      const vb = value(b, key)
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir || a.name.localeCompare(b.name)
    })
  })

  function sortBy(key: SortKey) {
    if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1
    else {
      sortKey = key
      sortDir = key === 'name' || key === 'kind' ? 1 : -1
    }
  }

  const ariaSort = (key: SortKey) =>
    sortKey === key ? (sortDir === 1 ? 'ascending' : 'descending') : ('none' as const)

  function stockNote(s: ProductStats) {
    const left = monthsLeft(s)
    if (left === null) return ''
    return left < 1 ? `Stock lasts ~${Math.round(left * 30)} days` : `Stock lasts ~${left.toFixed(1)} months`
  }

  const columns = $derived(7 + (showKind ? 1 : 0) + (trends ? 1 : 0) + (checks ? 1 : 0))

  const SORT_LABELS: Record<SortKey, string> = {
    order: 'Pinned order',
    name: 'Name',
    kind: 'Kind',
    quantity: 'Quantity',
    fill: 'Storage',
    produced: 'Produced',
    consumed: 'Consumed',
    net: 'Net',
  }
  const sortKeys = $derived(
    (['order', 'name', 'quantity', 'fill', 'produced', 'consumed', 'net'] as SortKey[]).filter(
      (k) => k !== 'order' || defaultSort === 'order',
    ),
  )
  const NET_CLASS = { pos: 'text-pos', neg: 'text-neg', zero: '' } as const
  const netTone = (n: number | null) => (n === null || n === 0 ? 'zero' : n > 0 ? 'pos' : 'neg')

  function openRow(e: MouseEvent, id: string) {
    if (reordering) return
    if ((e.target as HTMLElement).closest('a, button, input, label')) return
    router.go(href.product(id))
  }
</script>

{#snippet moveControls(id: string, name: string, idx: number)}
  <span class="flex items-center gap-0.5">
    <GripVertical size={18} class="text-muted max-md:hidden" aria-hidden="true" />
    <button
      type="button"
      class="inline-grid size-7 cursor-pointer place-items-center rounded-ui text-ink-2 hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-30"
      disabled={idx === 0}
      onclick={() => move(id, idx - 1)}
      aria-label="Move {name} up"
      title="Move up"
    >
      <ChevronUp size={18} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="inline-grid size-7 cursor-pointer place-items-center rounded-ui text-ink-2 hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-30"
      disabled={idx === rows.length - 1}
      onclick={() => move(id, idx + 1)}
      aria-label="Move {name} down"
      title="Move down"
    >
      <ChevronDown size={18} aria-hidden="true" />
    </button>
  </span>
{/snippet}

{#snippet checkbox(id: string, name: string)}
  {@const on = selectedSet.has(id)}
  <label class="inline-grid size-7 cursor-pointer place-items-center rounded-ui hover:bg-surface-2" title="Select to compare">
    <input
      type="checkbox"
      class="size-4 cursor-pointer accent-ink disabled:cursor-default"
      checked={on}
      disabled={!on && selected.length >= maxSelected}
      onchange={(e) => toggle(id, e.currentTarget.checked)}
      aria-label="Select {name}"
    />
  </label>
{/snippet}

{#snippet th(key: SortKey, label: string, numeric = false)}
  {@const active = sortKey === key}
  {@const SortIcon = active ? (sortDir === 1 ? ArrowUp : ArrowDown) : ChevronsUpDown}
  <th class={numeric ? 'num' : undefined} aria-sort={ariaSort(key)}>
    <button
      type="button"
      class={[
        'group/sort flex w-full cursor-pointer items-center gap-1 rounded-ui font-medium transition-colors duration-100',
        'hover:text-ink motion-reduce:transition-none',
        numeric && 'flex-row-reverse',
        active ? 'text-ink' : 'text-muted',
      ]}
      onclick={() => sortBy(key)}
      disabled={reordering}
    >
      {label}
      <SortIcon
        size={13}
        class={active ? '' : 'opacity-50 group-hover/sort:opacity-100'}
        aria-hidden="true"
      />
    </button>
  </th>
{/snippet}

<div class="overflow-x-auto max-md:hidden">
  <table class="data-table">
    <caption class="sr-only">{caption}</caption>
    <thead>
      <tr>
        {#if checks}<th class="w-9 pr-0"><span class="sr-only">Select</span></th>{/if}
        <th class={reordering ? 'w-24 pr-0' : 'w-9 pr-0'}><span class="sr-only">{reordering ? 'Order' : 'Pinned'}</span></th>
        {@render th('name', 'Product')}
        {#if showKind}{@render th('kind', 'Kind')}{/if}
        {@render th('quantity', 'Quantity', true)}
        {@render th('fill', 'Storage')}
        {@render th('produced', 'Produced', true)}
        {@render th('consumed', 'Consumed', true)}
        {@render th('net', 'Net', true)}
        {#if trends}<th class="grow">Trend</th>{/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as p, idx (p.id)}
        {@const s = stats[p.id] ?? {}}
        {@const n = net(s, period)}
        {@const t = trends?.[p.id]}
        <tr
          class={[
            reordering ? 'cursor-grab' : 'cursor-pointer',
            dragId === p.id && 'opacity-40',
            dropLine(idx) === 'top' && '[&>td]:shadow-[inset_0_3px_0_var(--text)]',
            dropLine(idx) === 'bottom' && '[&>td]:shadow-[inset_0_-3px_0_var(--text)]',
          ]}
          onclick={(e) => openRow(e, p.id)}
          draggable={reordering}
          ondragstart={(e) => {
            dragId = p.id
            e.dataTransfer?.setData('text/plain', p.id)
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
          }}
          ondragover={(e) => onDragOver(e, idx)}
          ondrop={(e) => {
            e.preventDefault()
            onDrop()
          }}
          ondragend={() => ((dragId = null), (dropAt = null))}
        >
          {#if checks}<td class="w-9 pr-0 pl-2">{@render checkbox(p.id, p.name)}</td>{/if}
          <td class={reordering ? 'w-24 pr-0 pl-2' : 'w-9 pr-0 pl-2'}>
            {#if reordering}
              {@render moveControls(p.id, p.name, idx)}
            {:else}
              <PinButton id={p.id} name={p.name} />
            {/if}
          </td>
          <td>
            <a class="group flex w-fit items-center gap-2 font-medium text-ink" href={href.product(p.id)}>
              <Icon id={p.id} size={20} />
              <span class="group-hover:underline">{p.name}</span>
            </a>
          </td>
          {#if showKind}<td class="text-ink-2">{KIND_LABELS[p.kind] ?? p.kind}</td>{/if}
          <td class="num font-semibold">{formatNumber(s.quantity)}</td>
          <td><StorageBar productId={p.id} stored={s.stored} capacity={s.storageCapacity} /></td>
          <td class="num">{formatNumber(flowAt(s.produced, period))}</td>
          <td class="num">{formatNumber(flowAt(s.consumed, period))}</td>
          <td class={['num', n !== null && n > 0 && 'text-pos', n !== null && n < 0 && 'text-neg']} title={stockNote(s)}>
            {n === null ? '–' : n === 0 ? '0' : formatSigned(n)}
          </td>
          {#if trends}
            <td class="grow">
              {#if t}
                <Sparkline
                  partialLast
                  fluid
                  label="{p.name}: produced vs consumed per month"
                  series={[
                    { values: t.produced ?? [], tone: 'produced' },
                    { values: t.consumed ?? [], tone: 'consumed' },
                  ]}
                />
              {/if}
            </td>
          {/if}
        </tr>
      {:else}
        <tr><td colspan={columns} class="h-24 text-center text-muted">Nothing to show.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<!-- Phones: one card per product instead of a side-scrolling table. -->
<div class="md:hidden">
  <div class={['flex items-center gap-2 border-b border-line px-3 py-2', reordering && 'hidden']}>
    <label class="text-xs text-ink-2" for="sort-{caption}">Sort</label>
    <select id="sort-{caption}" class="h-7 min-w-0 flex-1 text-xs" bind:value={sortKey}>
      {#each sortKeys as k (k)}<option value={k}>{SORT_LABELS[k]}</option>{/each}
    </select>
    <button
      type="button"
      class="inline-grid size-7 cursor-pointer place-items-center rounded-ui border border-line-strong text-ink-2 hover:bg-surface-2 disabled:opacity-40"
      disabled={sortKey === 'order'}
      onclick={() => (sortDir = sortDir === 1 ? -1 : 1)}
      aria-label={sortDir === 1 ? 'Ascending, switch to descending' : 'Descending, switch to ascending'}
      title="Reverse order"
    >
      <ArrowDownUp size={15} aria-hidden="true" />
    </button>
  </div>
  <ul aria-label={caption}>
    {#each rows as p, idx (p.id)}
      {@const s = stats[p.id] ?? {}}
      {@const n = net(s, period)}
      {@const t = trends?.[p.id]}
      <li class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 border-b border-line px-3 py-3 last:border-b-0">
        {#if reordering}{@render moveControls(p.id, p.name, idx)}{:else if checks}<span class="flex items-center"
            >{@render checkbox(p.id, p.name)}<PinButton id={p.id} name={p.name} /></span
          >{:else}<PinButton id={p.id} name={p.name} />{/if}
        <a class="flex min-w-0 items-center gap-2 text-base font-medium text-ink" href={href.product(p.id)}>
          <Icon id={p.id} size={24} />
          <span class="truncate">{p.name}</span>
        </a>
        <span class={['text-base font-semibold tabular-nums', NET_CLASS[netTone(n)]]} title={stockNote(s) || 'Net'}>
          {n === null ? '–' : n === 0 ? '0' : formatSigned(n)}
        </span>

        <span></span>
        <div class="flex min-w-0 flex-col gap-1.5">
          <div class="flex items-center gap-3">
            <span class="text-sm font-semibold tabular-nums">{formatNumber(s.quantity)}</span>
            <StorageBar productId={p.id} stored={s.stored} capacity={s.storageCapacity} width="5rem" />
          </div>
          <div class="flex items-center gap-3 text-sm text-ink-2 tabular-nums">
            <span class="inline-flex items-center gap-1.5" title="Produced">
              <span class="h-1 w-3 rounded-full bg-produced" aria-hidden="true"></span>{formatNumber(flowAt(s.produced, period))}
              <span class="sr-only">produced</span>
            </span>
            <span class="inline-flex items-center gap-1.5" title="Consumed">
              <span class="h-1 w-3 rounded-full bg-consumed" aria-hidden="true"></span>{formatNumber(flowAt(s.consumed, period))}
              <span class="sr-only">consumed</span>
            </span>
            {#if showKind}<span class="truncate text-xs text-muted">{KIND_LABELS[p.kind] ?? p.kind}</span>{/if}
          </div>
        </div>
        {#if t}
          <Sparkline
            partialLast
            width={80}
            height={30}
            label="{p.name}: produced vs consumed per month"
            series={[
              { values: t.produced ?? [], tone: 'produced' },
              { values: t.consumed ?? [], tone: 'consumed' },
            ]}
          />
        {:else}<span></span>{/if}
      </li>
    {:else}
      <li class="p-8 text-center text-muted">Nothing to show.</li>
    {/each}
  </ul>
</div>
