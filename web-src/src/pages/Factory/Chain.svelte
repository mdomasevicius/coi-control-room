<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import X from '@lucide/svelte/icons/x'
  import { api } from '@/logic/api/client'
  import Button from '@/components/Button/Button.svelte'
  import Icon from '@/components/Icon/Icon.svelte'
  import RecipeIcons from '@/components/RecipeIcons/RecipeIcons.svelte'
  import { chainFrom, focusChain, layoutChain, type ChainLink, type ChainNode } from '@/lib/chain'
  import { formatNumber } from '@/lib/format'
  import { getClock, getGameData } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'
  import { load, save } from '@/lib/storage'

  // Production chain: raw resources → machine recipes → products, link width by quantity in the period. Picking a
  // product (or clicking one in the diagram) narrows it to that product's upstream and downstream chain.
  const clock = getClock()
  const data = getGameData()

  const period = $derived(globalPeriod.value)

  let focus = $state<string>(load('factory.chain.focus', ''))
  $effect(() => save('factory.chain.focus', focus))

  const sources = new LiveResource(clock, () => period, (p, signal) => api.sources({ period: p }, signal))
  const names = $derived(sources.data?.names ?? {})
  const name = (id: string) => data.byId.get(id)?.name ?? names[id] ?? id

  const full = $derived(chainFrom(sources.data))
  const products = $derived(
    full.nodes
      .filter((n) => n.kind === 'product')
      .map((n) => n.id)
      .sort((a, b) => name(a).localeCompare(name(b))),
  )
  const focused = $derived(focus && products.includes(focus) ? focus : '')
  const graph = $derived(focused ? focusChain(full, focused) : full)

  let avail = $state(0)
  const narrow = $derived(avail > 0 && avail < 640)
  const layout = $derived(
    layoutChain(graph, {
      width: avail - 32,
      nodeWidth: narrow ? 148 : 160,
      minGap: narrow ? 40 : 48,
      maxGap: 240,
      minHeight: (n) => (n.kind === 'product' ? 40 : n.recipe ? 54 : 40),
      nodeGap: 12,
      flowHeight: 320,
      minLinkWidth: 2,
    }),
  )
  const byKey = $derived(new Map(layout.nodes.map((n) => [n.key, n])))

  // ---- hover / keyboard focus: highlight a node's links, or one link, and explain it in a floating box ----
  type Hover = { kind: 'node'; key: string } | { kind: 'link'; key: string }
  let hover = $state<Hover | null>(null)
  let tipAt = $state({ x: 0, y: 0, flip: false })
  let tipHeight = $state(0)

  const active = $derived.by(() => {
    if (!hover) return null
    const h = hover
    const links = new Set(
      layout.links.filter((l) => (h.kind === 'node' ? l.source === h.key || l.target === h.key : l.key === h.key)).map((l) => l.key),
    )
    const nodes = new Set(layout.links.filter((l) => links.has(l.key)).flatMap((l) => [l.source, l.target]))
    if (h.kind === 'node') nodes.add(h.key)
    return { links, nodes }
  })

  function showAt(h: Hover, x: number, y: number, flip: boolean) {
    hover = h
    tipAt = { x, y, flip }
  }
  function enterNode(n: ChainNode, el: HTMLElement) {
    const r = el.getBoundingClientRect()
    const flip = r.right + 300 > window.innerWidth
    showAt({ kind: 'node', key: n.key }, flip ? r.left - 10 : r.right + 10, r.top, flip)
  }
  function enterLink(l: ChainLink, e: PointerEvent) {
    const flip = e.clientX + 300 > window.innerWidth
    showAt({ kind: 'link', key: l.key }, flip ? e.clientX - 14 : e.clientX + 14, e.clientY + 14, flip)
  }
  const leave = () => (hover = null)
  const tipTop = $derived(Math.max(8, Math.min(tipAt.y, (typeof window === 'undefined' ? 0 : window.innerHeight) - tipHeight - 8)))

  // Into a process = consumed (orange), out of a process = produced (blue): the one color rule, shown on hover.
  const linkColor = (l: ChainLink) =>
    byKey.get(l.source)?.kind === 'process' ? 'var(--series-produced)' : 'var(--series-consumed)'
  const linkOpacity = (l: ChainLink) => (!active ? 0.3 : active.links.has(l.key) ? 0.8 : 0.07)

  /** A process focuses on what it mainly makes (or, for consumers like a food market, what it mainly takes). */
  function focusProcess(n: ChainNode) {
    const main = linksOf(n.key, 'out')[0] ?? linksOf(n.key, 'in')[0]
    if (main) focus = main.product
  }

  const label = (n: ChainNode) => name(n.id)
  const amount = (n: ChainNode) => Math.max(n.qIn, n.qOut)
  const linksOf = (key: string, side: 'in' | 'out') =>
    layout.links.filter((l) => (side === 'in' ? l.target : l.source) === key).sort((a, b) => b.quantity - a.quantity)
</script>

{#snippet tipRows(list: ChainLink[], other: 'source' | 'target', tone: 'text-neg' | 'text-pos')}
  <ul class="flex flex-col gap-1">
    {#each list as l (l.key)}
      {@const n = byKey.get(l[other])!}
      <li class="flex items-center gap-2">
        <Icon id={n.id} size={18} />
        <span class="min-w-0 flex-1 truncate">{label(n)}</span>
        <span class={['font-semibold tabular-nums', tone]}>{formatNumber(l.quantity)}</span>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet tipSection(title: string, list: ChainLink[], other: 'source' | 'target', tone: 'text-neg' | 'text-pos')}
  {#if list.length}
    <div class="flex flex-col gap-1">
      <span class="text-2xs text-muted">{title}</span>
      {@render tipRows(list, other, tone)}
    </div>
  {/if}
{/snippet}

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center gap-3">
    <div class="flex min-w-0 items-center gap-2">
      <select class="max-w-[16rem] min-w-0" aria-label="Focus on a product" bind:value={focus}>
        <option value="">All products</option>
        {#each products as id (id)}<option value={id}>{name(id)}</option>{/each}
      </select>
      {#if focused}
        <Button variant="ghost" size="icon" aria-label="Show all products" title="Show all products" onclick={() => (focus = '')}>
          <X size={16} aria-hidden="true" />
        </Button>
      {/if}
    </div>
  </div>

  <section class="min-w-0 rounded-ui border border-line bg-surface">
    <div class="overflow-x-auto p-4" bind:clientWidth={avail} onscroll={leave}>
      {#if !sources.data}
        <p class="text-sm text-muted">{sources.error ?? 'Loading…'}</p>
      {:else if layout.nodes.length === 0}
        <p class="text-sm text-muted">No machine ran in this period.</p>
      {:else}
        <div class="relative" style:width="{layout.width}px" style:height="{layout.height}px">
          <svg class="absolute inset-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden="true">
            {#each layout.links as l (l.key)}
              <path
                d={l.path}
                fill="none"
                stroke={active?.links.has(l.key) ? linkColor(l) : 'var(--text-2)'}
                stroke-opacity={linkOpacity(l)}
                stroke-width={l.width}
                stroke-dasharray={l.back ? '6 4' : undefined}
                class="transition-[stroke-opacity] duration-100 motion-reduce:transition-none"
                role="presentation"
                onpointerenter={(e) => enterLink(l, e)}
                onpointermove={(e) => enterLink(l, e)}
                onpointerleave={leave}
              />
            {/each}
          </svg>

          {#each layout.nodes as n (n.key)}
            {@const dim = active && !active.nodes.has(n.key)}
            {@const isFocus = n.kind === 'product' && n.id === focused}
            {#if n.kind === 'product'}
              <button
                type="button"
                class={[
                  'absolute flex cursor-pointer items-center gap-2 rounded-ui px-2 text-left transition-opacity duration-100 motion-reduce:transition-none',
                  isFocus ? 'bg-sel text-sel-ink' : 'bg-surface-2 text-ink hover:ring-1 hover:ring-line-strong',
                  dim && 'opacity-35',
                ]}
                style:left="{n.x}px"
                style:top="{n.y}px"
                style:width="{n.w}px"
                style:height="{n.h}px"
                aria-label="{label(n)}, {formatNumber(amount(n))}. Focus the chain on it"
                onpointerenter={(e) => enterNode(n, e.currentTarget)}
                onpointerleave={leave}
                onfocus={(e) => enterNode(n, e.currentTarget)}
                onblur={leave}
                onclick={() => (focus = isFocus ? '' : n.id)}
              >
                <Icon id={n.id} size={24} />
                <span class="min-w-0 flex-1 truncate text-xs font-medium">{label(n)}</span>
                <span class={['text-2xs tabular-nums', isFocus ? '' : 'text-ink-2']}>{formatNumber(amount(n))}</span>
              </button>
            {:else}
              <button
                type="button"
                class={[
                  'absolute flex cursor-pointer flex-col justify-center gap-1 rounded-ui border border-line-strong bg-surface px-2 text-left transition-opacity duration-100 hover:bg-surface-2 motion-reduce:transition-none',
                  dim && 'opacity-35',
                ]}
                style:left="{n.x}px"
                style:top="{n.y}px"
                style:width="{n.w}px"
                style:height="{n.h}px"
                aria-label="{n.recipe ? `${label(n)}: ${names[n.recipe] ?? n.recipe}` : label(n)}. Focus the chain on its main product"
                onpointerenter={(e) => enterNode(n, e.currentTarget)}
                onpointerleave={leave}
                onfocus={(e) => enterNode(n, e.currentTarget)}
                onblur={leave}
                onclick={() => focusProcess(n)}
              >
                <span class="flex min-w-0 items-center gap-2">
                  <Icon id={n.id} size={22} />
                  <span class="min-w-0 truncate text-xs font-semibold">{label(n)}</span>
                </span>
                {#if n.recipe}<RecipeIcons recipe={names[n.recipe] ?? n.recipe} size={16} />{/if}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>

{#if hover}
  {@const h = hover}
  <div
    class="pointer-events-none fixed z-30 flex w-72 flex-col gap-2 rounded-ui border border-line-strong bg-surface px-3 py-2 text-xs text-ink-2 shadow-lg"
    style:left={tipAt.flip ? undefined : `${tipAt.x}px`}
    style:right={tipAt.flip ? `${window.innerWidth - tipAt.x}px` : undefined}
    style:top="{tipTop}px"
    bind:offsetHeight={tipHeight}
    role="tooltip"
  >
    {#if h.kind === 'node'}
      {@const n = byKey.get(h.key)}
      {#if n}
        <div class="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon id={n.id} size={22} />
          <span class="min-w-0 truncate">{label(n)}</span>
        </div>
        {#if n.recipe}<RecipeIcons recipe={names[n.recipe] ?? n.recipe} size={18} />{/if}
        {#if n.kind === 'product'}
          {@render tipSection('Produced by', linksOf(n.key, 'in'), 'source', 'text-pos')}
          {@render tipSection('Consumed by', linksOf(n.key, 'out'), 'target', 'text-neg')}
        {:else}
          {@render tipSection('Consumes', linksOf(n.key, 'in'), 'source', 'text-neg')}
          {@render tipSection('Produces', linksOf(n.key, 'out'), 'target', 'text-pos')}
        {/if}
      {/if}
    {:else}
      {@const l = layout.links.find((x) => x.key === h.key)}
      {#if l}
        {@const s = byKey.get(l.source)!}
        {@const t = byKey.get(l.target)!}
        {@const produced = s.kind === 'process'}
        <div class="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon id={l.product} size={22} />
          <span class="min-w-0 flex-1 truncate">{name(l.product)}</span>
          <span class={['tabular-nums', produced ? 'text-pos' : 'text-neg']}>{formatNumber(l.quantity)}</span>
        </div>
        <span>{produced ? `Produced by ${label(s)}` : `Consumed by ${label(t)}`}</span>
      {/if}
    {/if}
  </div>
{/if}
