<script lang="ts" module>
  import { load, save } from '@/lib/storage'

  // Filters survive navigating to a product and back (module state) and reloads (localStorage).
  const saved = load('products.filters', { kind: 'all', pinnedOnly: false, hideIdle: false })
  const filters = $state({ query: '', ...saved })
  // Products ticked for a comparison; kept while browsing (module state), not across reloads.
  let picked = $state<string[]>([])
</script>

<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import { KIND_LABELS } from '@/lib/analysis'
  import { api } from '@/logic/api/client'
  import Search from '@lucide/svelte/icons/search'
  import ProductTable, { productCsv } from '@/components/ProductTable/ProductTable.svelte'
  import CsvButton from '@/components/CsvButton/CsvButton.svelte'
  import Icon from '@/components/Icon/Icon.svelte'
  import ChartSpline from '@lucide/svelte/icons/chart-spline'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import X from '@lucide/svelte/icons/x'
  import { MAX_COMPARE } from '@/pages/Compare/compare'
  import { href, router } from '@/lib/router.svelte'
  import type { Product } from '@/logic/api/types'
  import PageHeader from '@/components/PageHeader/PageHeader.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import Button from '@/components/Button/Button.svelte'
  import Segmented, { type SegmentOption } from '@/components/Segmented/Segmented.svelte'
  import { getClock, getGameData } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'

  const clock = getClock()
  const period = $derived(globalPeriod.value)
  const data = getGameData()

  $effect(() => {
    const { kind, pinnedOnly, hideIdle } = filters
    save('products.filters', { kind, pinnedOnly, hideIdle })
  })

  const kinds = $derived.by(() => {
    const counts = new Map<string, number>()
    for (const p of data.products) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1)
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]))
  })


  // A restored kind that no longer exists (older save, renamed kind) would silently match nothing: treat it as all.
  const kind = $derived(filters.kind === 'all' || kinds.some(([k]) => k === filters.kind) ? filters.kind : 'all')
  const filtered = $derived(kind !== 'all' || filters.pinnedOnly || filters.hideIdle || filters.query.trim() !== '')

  function clearFilters() {
    filters.kind = 'all'
    filters.pinnedOnly = false
    filters.hideIdle = false
    filters.query = ''
  }

  const kindOptions: SegmentOption<string>[] = $derived([
    { value: 'all', label: 'All', count: data.products.length },
    ...kinds.map(([kind, n]) => ({ value: kind, label: KIND_LABELS[kind] ?? kind, count: n })),
  ])


  const visible = $derived.by(() => {
    const q = filters.query.trim().toLowerCase()
    return data.products.filter((p) => {
      if (kind !== 'all' && p.kind !== kind) return false
      if (filters.pinnedOnly && !data.pinnedSet.has(p.id)) return false
      if (q && !p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) return false
      if (filters.hideIdle) {
        const s = data.stats[p.id]
        if (s && !s.quantity && !s.produced?.[4] && !s.consumed?.[4]) return false
      }
      return true
    })
  })

  // Sparklines for every unlocked product: one ~3 KB request.
  const trends = new LiveResource(
    clock,
    () => null,
    async (_, signal) => (await api.history({ series: ['produced', 'consumed'], count: 12 }, signal)).products,
  )

  // Picks of products that left the catalog (another save) don't count.
  const pickedIds = $derived(picked.filter((id) => data.byId.has(id)))

  // Research progress: the full catalog, refetched when the game month changes (unlocks are rare).
  let lockedOpen = $state(load('products.lockedOpen', false))
  $effect(() => save('products.lockedOpen', lockedOpen))
  let catalog = $state<Product[] | null>(null)
  const monthKey = $derived(clock.info ? `${clock.info.sessionId}/${clock.info.date.split('-').slice(0, 2).join('-')}` : null)
  $effect(() => {
    if (!monthKey) return
    const ctrl = new AbortController()
    api
      .products({ includeLocked: true }, ctrl.signal)
      .then((r) => (catalog = r.products))
      .catch(() => {})
    return () => ctrl.abort()
  })
  const locked = $derived.by(() => {
    if (!catalog) return null
    const groups = new Map<string, Product[]>()
    for (const p of catalog) {
      if (p.isUnlocked) continue
      const list = groups.get(p.kind) ?? []
      list.push(p)
      groups.set(p.kind, list)
    }
    return {
      total: catalog.length,
      unlocked: catalog.filter((p) => p.isUnlocked).length,
      groups: [...groups].sort((a, b) => a[0].localeCompare(b[0])).map(([k, list]) => [k, list.sort((a, b) => a.name.localeCompare(b.name))] as const),
    }
  })

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      filters.query = ''
      ;(e.target as HTMLInputElement).blur()
    }
  }
</script>

<div class="flex flex-col gap-4">
<PageHeader title="Products" />

<Panel flush>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line px-4 py-3">
    <label class="relative max-sm:w-full">
      <span class="sr-only">Search products</span>
      <Search size={15} class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        id="product-search"
        type="search"
        class="w-60 pl-8 max-sm:w-full"
        placeholder="Search ( / )"
        autocomplete="off"
        bind:value={filters.query}
        onkeydown={onSearchKey}
      />
    </label>
    <!-- Six kinds don't fit a phone row as segments; a select keeps the same filter there. -->
    <Segmented class="max-md:hidden" label="Kind" options={kindOptions} value={kind} onchange={(v) => (filters.kind = v)} />
    <label class="flex items-center gap-2 text-xs text-ink-2 md:hidden">
      Kind
      <select value={kind} onchange={(e) => (filters.kind = e.currentTarget.value)}>
        <option value="all">All ({data.products.length})</option>
        {#each kinds as [kind, n] (kind)}
          <option value={kind}>{KIND_LABELS[kind] ?? kind} ({n})</option>
        {/each}
      </select>
    </label>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label class="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-2">
        <input class="size-3.5 cursor-pointer accent-ink" type="checkbox" bind:checked={filters.pinnedOnly} /> Pinned only
      </label>
      <label class="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-2">
        <input class="size-3.5 cursor-pointer accent-ink" type="checkbox" bind:checked={filters.hideIdle} /> Hide unused
      </label>
    </div>
    {#if data.loaded}
      <span class="ml-auto flex items-center gap-2">
        <span class="text-xs text-muted tabular-nums">{visible.length} of {data.products.length} shown</span>
        <CsvButton name="products {period}" label="Download shown products as CSV" table={() => productCsv(visible, data.stats, period)} />
      </span>
    {/if}
  </div>

  {#if pickedIds.length}
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface-2 px-4 py-2">
      <Button size="sm" onclick={() => router.go(href.compare(pickedIds))}>
        <ChartSpline size={15} aria-hidden="true" /> Compare ({pickedIds.length})
      </Button>
      <span class="text-xs text-ink-2">
        {pickedIds.length < 2 ? 'Tick another product to compare' : pickedIds.length >= MAX_COMPARE ? `Up to ${MAX_COMPARE} products` : ''}
      </span>
      <Button size="sm" variant="ghost" class="ml-auto" onclick={() => (picked = [])}>
        <X size={15} aria-hidden="true" /> Clear
      </Button>
    </div>
  {/if}

  {#if !data.loaded}
    <p class="p-4 text-sm text-muted">{data.error ? data.error : 'Loading…'}</p>
  {:else if visible.length === 0 && filtered}
    <div class="flex flex-col items-center gap-3 p-10 text-center">
      <p class="text-sm text-ink-2">No product matches these filters.</p>
      <Button onclick={clearFilters}>Clear filters</Button>
    </div>
  {:else}
    <ProductTable
      caption="Unlocked products"
      products={visible}
      stats={data.stats}
      period={period}
      trends={trends.data}
      showKind
      defaultSort="name"
      selectable
      bind:selected={picked}
      maxSelected={MAX_COMPARE}
    />
  {/if}
</Panel>

{#if locked}
  <details class="group rounded-ui border border-line bg-surface" bind:open={lockedOpen}>
    <summary
      class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
    >
      <ChevronRight size={16} class="text-muted transition-transform duration-100 group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
      <h2 class="text-sm font-semibold">Locked products</h2>
      <span class="text-xs text-ink-2 tabular-nums">{locked.unlocked} of {locked.total} unlocked</span>
      <span class="ml-auto h-2 w-24 overflow-hidden rounded-full bg-line max-sm:hidden" aria-hidden="true">
        <span class="block h-full rounded-full bg-ink-2" style:width="{(locked.unlocked / Math.max(1, locked.total)) * 100}%"></span>
      </span>
    </summary>
    <div class="flex flex-col gap-4 border-t border-line p-4">
      {#each locked.groups as [kind, list] (kind)}
        <section class="flex flex-col gap-2">
          <h3 class="text-xs text-ink-2">
            {KIND_LABELS[kind] ?? kind} <span class="text-muted tabular-nums">{list.length}</span>
          </h3>
          <ul class="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-4 gap-y-1.5">
            {#each list as p (p.id)}
              <li class="flex min-w-0 items-center gap-2 text-sm text-muted">
                <span class="opacity-60 grayscale"><Icon id={p.id} size={20} /></span>
                <span class="truncate" title={p.name}>{p.name}</span>
              </li>
            {/each}
          </ul>
        </section>
      {:else}
        <p class="text-sm text-muted">Every product is unlocked.</p>
      {/each}
    </div>
  </details>
{/if}
</div>
