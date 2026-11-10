<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus'
  import Search from '@lucide/svelte/icons/search'
  import X from '@lucide/svelte/icons/x'
  import Icon from '@/components/Icon/Icon.svelte'
  import { catColor } from '@/lib/food'
  import type { Product } from '@/logic/api/types'

  // Chips for the chosen products (in their chart color) plus a search box that adds more.
  let {
    chosen,
    products,
    max,
    nameOf,
    onchange,
  }: {
    chosen: string[]
    products: Product[]
    max: number
    nameOf: (id: string) => string
    onchange: (ids: string[]) => void
  } = $props()

  let query = $state('')
  let open = $state(false)
  let active = $state(0)
  let input = $state<HTMLInputElement>()

  const full = $derived(chosen.length >= max)
  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase()
    const taken = new Set(chosen)
    return products
      .filter((p) => !taken.has(p.id) && (!q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)))
      .slice(0, 8)
  })
  const showList = $derived(open && !full && matches.length > 0)

  function add(id: string) {
    onchange([...chosen, id])
    query = ''
    active = 0
    input?.focus()
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      open = true
      active = Math.min(active + 1, matches.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      active = Math.max(active - 1, 0)
    } else if (e.key === 'Enter' && showList) {
      e.preventDefault()
      const p = matches[active]
      if (p) add(p.id)
    } else if (e.key === 'Escape') {
      if (open && query === '') input?.blur()
      open = false
      query = ''
    } else if (e.key === 'Backspace' && query === '' && chosen.length) {
      onchange(chosen.slice(0, -1))
    }
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  <ul class="contents" aria-label="Compared products">
    {#each chosen as id, i (id)}
      <li class="inline-flex h-8 items-center gap-2 rounded-ui border border-line-strong bg-surface pr-0.5 pl-2 text-sm text-ink">
        <span class="h-1 w-4 flex-none rounded-full" style:background="var({catColor(i)})" aria-hidden="true"></span>
        <Icon {id} size={18} />
        <span class="max-w-48 truncate font-medium">{nameOf(id)}</span>
        <button
          type="button"
          class="inline-grid size-7 cursor-pointer place-items-center rounded-ui text-muted hover:bg-surface-2 hover:text-ink"
          aria-label="Remove {nameOf(id)}"
          title="Remove"
          onclick={() => onchange(chosen.filter((x) => x !== id))}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </li>
    {/each}
  </ul>

  {#if full}
    <span class="text-xs text-muted">Up to {max} products</span>
  {:else}
    <div class="relative max-sm:w-full">
      <label class="relative block">
        <span class="sr-only">Add a product</span>
        {#if chosen.length}
          <Plus size={15} class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden="true" />
        {:else}
          <Search size={15} class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden="true" />
        {/if}
        <input
          bind:this={input}
          type="search"
          class="w-60 pl-8 max-sm:w-full"
          placeholder="Add a product"
          autocomplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls="compare-picker-list"
          aria-autocomplete="list"
          aria-activedescendant={showList ? `compare-opt-${active}` : undefined}
          bind:value={query}
          oninput={() => ((open = true), (active = 0))}
          onfocus={() => (open = true)}
          onblur={() => (open = false)}
          onkeydown={onKey}
        />
      </label>
      {#if showList}
        <ul
          id="compare-picker-list"
          role="listbox"
          aria-label="Matching products"
          class="absolute top-full left-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-ui border border-line-strong bg-surface p-1 shadow-lg"
        >
          {#each matches as p, i (p.id)}
            <li
              id="compare-opt-{i}"
              role="option"
              aria-selected={i === active}
              class={[
                'flex cursor-pointer items-center gap-2 rounded-[3px] px-2 py-1.5 text-sm text-ink',
                i === active && 'bg-surface-2',
              ]}
              onmousedown={(e) => (e.preventDefault(), add(p.id))}
              onmouseenter={() => (active = i)}
            >
              <Icon id={p.id} size={20} />
              <span class="truncate">{p.name}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
