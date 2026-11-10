<script lang="ts">
  import type { Component } from 'svelte'
  import Search from '@lucide/svelte/icons/search'
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
  import Package from '@lucide/svelte/icons/package'
  import FactoryIcon from '@lucide/svelte/icons/factory'
  import Wheat from '@lucide/svelte/icons/wheat'
  import House from '@lucide/svelte/icons/house'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Zap from '@lucide/svelte/icons/zap'
  import Cpu from '@lucide/svelte/icons/cpu'
  import Terminal from '@lucide/svelte/icons/terminal'
  import GitCompareArrows from '@lucide/svelte/icons/git-compare-arrows'
  import Gauge from '@lucide/svelte/icons/gauge'
  import SquareTerminal from '@lucide/svelte/icons/square-terminal'
  import Play from '@lucide/svelte/icons/play'
  import Pause from '@lucide/svelte/icons/pause'
  import Monitor from '@lucide/svelte/icons/monitor'
  import Sun from '@lucide/svelte/icons/sun'
  import Moon from '@lucide/svelte/icons/moon'
  import X from '@lucide/svelte/icons/x'
  import { api } from '@/logic/api/client'
  import { theme } from '@/logic/theme.svelte'
  import { READ_ONLY } from '@/logic/readOnly'
  import { getClock, getGameData } from '@/lib/live/context'
  import { href, router, type FactoryTab } from '@/lib/router.svelte'
  import Icon from '@/components/Icon/Icon.svelte'

  type CommandResult = { ok: boolean; error: string }

  let {
    open = $bindable(false),
    togglePause,
    setSpeed,
    speeds,
    send,
  }: {
    open: boolean
    togglePause: () => void
    setSpeed: (speed: number) => void
    /** The speeds the top bar offers (1-3×, plus the game's faster speed when it has one). */
    speeds: () => number[]
    /** Runs a game command and reports failures (TopBar.send). */
    send: (fn: () => Promise<CommandResult>) => void
  } = $props()

  const clock = getClock()
  const data = getGameData()

  type Group = 'Pages' | 'Products' | 'Actions'
  interface Item {
    key: string
    group: Group
    label: string
    /** Extra words that match the search but aren't shown. */
    keywords?: string
    hint?: string
    icon?: Component<{ size?: number; 'aria-hidden'?: 'true' }>
    productId?: string
    run: () => void
  }

  const go = (to: string) => () => router.go(to)

  const FACTORY: [FactoryTab, string][] = [
    ['machines', 'Machines'],
    ['chain', 'Production chain'],
    ['upkeep', 'Construction & upkeep'],
    ['waste', 'Waste & dumping'],
    ['mining', 'Mining & fuel'],
  ]
  const PAGES: Item[] = [
    { key: 'p:overview', group: 'Pages', label: 'Overview', icon: LayoutDashboard, run: go(href.overview) },
    { key: 'p:products', group: 'Pages', label: 'Products', icon: Package, run: go(href.products) },
    { key: 'p:compare', group: 'Pages', label: 'Compare products', icon: GitCompareArrows, run: go(href.compare()) },
    ...FACTORY.map(([tab, label]): Item => ({
      key: `p:factory:${tab}`,
      group: 'Pages',
      label,
      hint: 'Factory',
      keywords: 'factory',
      icon: FactoryIcon,
      run: go(href.factory(tab)),
    })),
    { key: 'p:food', group: 'Pages', label: 'Food & farms', icon: Wheat, run: go(href.food) },
    { key: 'p:settlements', group: 'Pages', label: 'Settlements', icon: House, run: go(href.settlements) },
    { key: 'p:unity', group: 'Pages', label: 'Unity', icon: Sparkles, run: go(href.unity) },
    { key: 'p:electricity', group: 'Pages', label: 'Electricity', keywords: 'electricity power', icon: Zap, run: go(href.electricity) },
    { key: 'p:computing', group: 'Pages', label: 'Computing', keywords: 'computing tflops data center', icon: Cpu, run: go(href.computing) },
    { key: 'p:console', group: 'Pages', label: READ_ONLY ? 'Camera' : 'Console', icon: Terminal, run: go(href.console) },
  ]

  const CONSOLE_COMMANDS: [string, string][] = [
    ['toggle_fog_rendering', 'Toggle fog'],
    ['camera_toggle_terrain_clip_check', 'Toggle camera terrain clipping'],
  ]

  const actions: Item[] = $derived([
    ...(READ_ONLY ? [] : gameActions()),
    ...(
      [
        ['auto', 'Theme: follow the system', Monitor],
        ['light', 'Theme: light', Sun],
        ['dark', 'Theme: dark', Moon],
      ] as const
    ).map(
      ([t, label, icon]): Item => ({
        key: `a:theme:${t}`,
        group: 'Actions',
        label,
        keywords: 'appearance mode',
        icon,
        hint: theme.preference === t ? 'Current' : undefined,
        run: () => theme.set(t),
      }),
    ),
  ])

  /** Actions that send commands to the game (left out in read-only mode). */
  function gameActions(): Item[] {
    return [
      {
        key: 'a:pause',
        group: 'Actions',
        label: clock.info?.isPaused ? 'Resume game' : 'Pause game',
        keywords: 'pause resume play stop',
        hint: 'Space',
        icon: clock.info?.isPaused ? Play : Pause,
        run: togglePause,
      },
      ...speeds().map(
        (s): Item => ({
          key: `a:speed:${s}`,
          group: 'Actions',
          label: `Game speed ${s}×`,
          keywords: `speed ${s}x`,
          icon: Gauge,
          hint: clock.info?.speed === s ? 'Current' : undefined,
          run: () => setSpeed(s),
        }),
      ),
      ...CONSOLE_COMMANDS.map(
        ([cmd, label]): Item => ({
          key: `a:console:${cmd}`,
          group: 'Actions',
          label,
          keywords: `console ${cmd} ${cmd.replaceAll('_', ' ')}`,
          hint: cmd,
          icon: SquareTerminal,
          run: () => send(() => api.console(cmd)),
        }),
      ),
    ]
  }

  const products: Item[] = $derived(
    data.products.map((p) => ({
      key: `pr:${p.id}`,
      group: 'Products' as const,
      label: p.name,
      keywords: p.id,
      productId: p.id,
      run: go(href.product(p.id)),
    })),
  )

  let query = $state('')
  let active = $state(0)
  let dialog: HTMLDialogElement
  let input: HTMLInputElement
  let list: HTMLElement

  const MAX_PRODUCTS = 40

  /** 0 = no match; higher is better (label prefix > word prefix > anywhere). */
  function score(item: Item, words: string[]) {
    const label = item.label.toLowerCase()
    const hay = `${label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase()
    if (!words.every((w) => hay.includes(w))) return 0
    const first = words[0]
    if (label.startsWith(first)) return 3
    if (label.split(/[\s&]+/).some((w) => w.startsWith(first))) return 2
    return 1
  }

  const results: Item[] = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) {
      const pinned = data.pinnedIds.map((id) => products.find((p) => p.productId === id)).filter((p) => !!p)
      return [...PAGES, ...pinned, ...actions]
    }
    const rank = (items: Item[]) =>
      items
        .map((item) => ({ item, s: score(item, words) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((r) => r.item)
    return [...rank(PAGES), ...rank(products).slice(0, MAX_PRODUCTS), ...rank(actions)]
  })

  const groups = $derived(
    (['Pages', 'Products', 'Actions'] as const)
      .map((g) => ({ name: g, items: results.filter((r) => r.group === g) }))
      .filter((g) => g.items.length),
  )
  const GROUP_LABEL: Record<Group, (empty: boolean) => string> = {
    Pages: () => 'Pages',
    Products: (empty) => (empty ? 'Pinned products' : 'Products'),
    Actions: () => 'Actions',
  }

  $effect(() => {
    void query
    active = 0
  })

  $effect(() => {
    if (open && !dialog.open) {
      query = ''
      dialog.showModal()
      input.focus()
    }
    if (!open && dialog.open) dialog.close()
  })

  const optionId = (i: number) => `palette-opt-${i}`

  function move(delta: number) {
    if (!results.length) return
    active = (active + delta + results.length) % results.length
    list.querySelector(`#${optionId(active)}`)?.scrollIntoView({ block: 'nearest' })
  }

  function choose(item: Item | undefined) {
    if (!item) return
    dialog.close()
    item.run()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape' && query) {
      // First Esc clears the search, the second closes.
      e.preventDefault()
      query = ''
    }
  }

  // Flat index of each item, for keyboard focus across groups.
  const indexOf = $derived(new Map(results.map((r, i) => [r.key, i])))
</script>

<dialog
  class={[
    'rounded-ui border border-line-strong bg-surface text-ink shadow-lg backdrop:bg-scrim',
    'm-auto w-[min(36rem,calc(100vw-2rem))] max-w-none sm:mt-[12vh]',
    // Phones: a full-width sheet from the top edge, clear of the on-screen keyboard.
    'max-sm:mt-0 max-sm:w-full max-sm:rounded-t-none max-sm:border-x-0 max-sm:border-t-0',
  ]}
  aria-label="Command palette"
  bind:this={dialog}
  onclose={() => (open = false)}
  onclick={(e) => e.target === dialog && dialog.close()}
>
  <div class="flex items-center gap-2 border-b border-line px-4">
    <Search size={17} class="flex-none text-muted" aria-hidden="true" />
    <input
      bind:this={input}
      bind:value={query}
      onkeydown={onKeydown}
      class="h-12 min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-none placeholder:text-muted"
      placeholder="Go to a page or product, run an action"
      role="combobox"
      aria-expanded="true"
      aria-controls="palette-list"
      aria-activedescendant={results.length ? optionId(active) : undefined}
      aria-autocomplete="list"
      autocomplete="off"
      spellcheck="false"
    />
    <kbd class="max-sm:hidden">Esc</kbd>
    <button
      type="button"
      class="-mr-2 inline-grid size-10 flex-none cursor-pointer place-items-center rounded-ui text-ink-2 hover:bg-surface-2 sm:hidden"
      aria-label="Close"
      onclick={() => dialog.close()}
    >
      <X size={18} aria-hidden="true" />
    </button>
  </div>

  <div
    bind:this={list}
    id="palette-list"
    role="listbox"
    aria-label="Results"
    class="max-h-[min(60vh,30rem)] overflow-y-auto overscroll-contain py-1 max-sm:max-h-[calc(100dvh-3.5rem)]"
  >
    {#if !results.length}
      <p class="px-4 py-6 text-center text-sm text-muted">Nothing matches "{query}"</p>
    {/if}
    {#each groups as group (group.name)}
      <div role="group" aria-labelledby="palette-g-{group.name}">
        <div id="palette-g-{group.name}" class="px-4 pt-2 pb-1 text-xs text-ink-2">
          {GROUP_LABEL[group.name](!query.trim())}
        </div>
        {#each group.items as item (item.key)}
          {@const i = indexOf.get(item.key) ?? 0}
          <!-- Options are picked with the keyboard from the input (aria-activedescendant) or by click. -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            id={optionId(i)}
            role="option"
            tabindex="-1"
            aria-selected={i === active}
            class={[
              'mx-1 flex min-h-10 cursor-pointer items-center gap-3 rounded-ui px-3 text-sm',
              i === active ? 'bg-sel text-sel-ink' : 'text-ink',
            ]}
            onmousemove={() => (active = i)}
            onclick={() => choose(item)}
          >
            <span class={['grid size-5 flex-none place-items-center', i === active ? '' : 'text-ink-2']}>
              {#if item.productId}
                <Icon id={item.productId} size={20} />
              {:else if item.icon}
                <item.icon size={16} aria-hidden="true" />
              {/if}
            </span>
            <span class="min-w-0 flex-1 truncate">{item.label}</span>
            {#if item.hint}
              <span class={['truncate text-xs max-sm:hidden', i === active ? 'opacity-80' : 'text-muted']}>{item.hint}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>

  <footer class="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-ink-2 max-sm:hidden">
    <span class="flex items-center gap-1.5"><kbd>↑</kbd><kbd>↓</kbd> Move</span>
    <span class="flex items-center gap-1.5"><kbd>Enter</kbd> Open or run</span>
    <span class="flex items-center gap-1.5"><kbd>Esc</kbd> Close</span>
  </footer>
</dialog>
