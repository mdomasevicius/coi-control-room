<script lang="ts">
  import Menu from '@lucide/svelte/icons/menu'
  import X from '@lucide/svelte/icons/x'
  import Play from '@lucide/svelte/icons/play'
  import Pause from '@lucide/svelte/icons/pause'
  import Keyboard from '@lucide/svelte/icons/keyboard'
  import Monitor from '@lucide/svelte/icons/monitor'
  import Sun from '@lucide/svelte/icons/sun'
  import Moon from '@lucide/svelte/icons/moon'
  import CalendarRange from '@lucide/svelte/icons/calendar-range'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import { PERIODS } from '@/lib/analysis'
  import { globalPeriod } from '@/logic/period.svelte'
  import type { FlowPeriod } from '@/logic/api/types'
  import { api } from '@/logic/api/client'
  import { formatGameDate, parseGameDate } from '@/logic/api/gameDate'
  import { theme, type ThemePreference } from '@/logic/theme.svelte'
  import { getClock } from '@/lib/live/context'
  import { READ_ONLY } from '@/logic/readOnly'
  import { href, router } from '@/lib/router.svelte'
  import Button from '@/components/Button/Button.svelte'
  import Segmented, { type SegmentOption } from '@/components/Segmented/Segmented.svelte'
  import Tooltip from '@/components/Tooltip/Tooltip.svelte'

  let { onHelp }: { onHelp: () => void } = $props()

  const clock = getClock()

  // 1-3× always; a 4th speed only when the game itself offers one (sandbox, or after set_game_speed above 3 in the
  // console), at the speed it offers. The ControlRoom mod reports that; without the mod, a current speed above 3×
  // still shows as the 4th button. Shortcut keys 1-4 map to these in order.
  let offeredSuperSpeed = $state<number | null>(null)
  const superSpeedKey = $derived(clock.info ? `${clock.info.sessionId}:${clock.info.date}` : '')
  $effect(() => {
    if (!superSpeedKey) return
    const abort = new AbortController()
    api
      .modSpeed(abort.signal)
      .then((r) => (offeredSuperSpeed = r.superSpeed))
      .catch(() => {})
    return () => abort.abort()
  })
  const currentSpeed = $derived(clock.info?.speed ?? 1)
  const superSpeed = $derived(offeredSuperSpeed ?? (currentSpeed > 3 ? currentSpeed : null))
  const speeds = $derived(superSpeed ? [1, 2, 3, superSpeed] : [1, 2, 3])
  const speedOptions: SegmentOption<number>[] = $derived(
    speeds.map((s, i) => ({ value: s, label: `${s}×`, title: `Speed ${s}× (key ${i + 1})` })),
  )
  const THEME_OPTIONS: SegmentOption<ThemePreference>[] = [
    { value: 'auto', label: 'Auto', icon: Monitor, title: 'Theme: follow the system' },
    { value: 'light', label: 'Light', icon: Sun, title: 'Theme: light' },
    { value: 'dark', label: 'Dark', icon: Moon, title: 'Theme: dark' },
  ]

  const currentTheme = $derived(THEME_OPTIONS.find((o) => o.value === theme.preference) ?? THEME_OPTIONS[0])
  const nextTheme = $derived(THEME_OPTIONS[(THEME_OPTIONS.indexOf(currentTheme) + 1) % THEME_OPTIONS.length])

  let busy = $state(false)
  let commandError = $state<string | null>(null)
  let menuOpen = $state(false)
  let bar: HTMLElement

  type Status = 'live' | 'paused' | 'offline'
  const status: Status = $derived(!clock.connected ? 'offline' : clock.info?.isPaused ? 'paused' : 'live')
  const STATUS = {
    live: { label: 'Live', text: 'Connected to the game. The numbers update as it runs.' },
    paused: { label: 'Paused', text: 'Connected to the game. It is paused, so the numbers hold still.' },
    offline: {
      label: 'Offline',
      text: 'The game is not answering. Check that it is running and its web API is on (console: web_api_start). Click to try again.',
    },
  } as const

  const nav = [
    { label: 'Overview', href: href.overview, active: () => router.route.name === 'overview' },
    {
      label: 'Products',
      href: href.products,
      active: () => ['products', 'product', 'compare'].includes(router.route.name),
    },
    { label: 'Factory', href: href.factory(), active: () => router.route.name === 'factory' },
    { label: 'Food & farms', href: href.food, active: () => router.route.name === 'food' },
    { label: 'Settlements', href: href.settlements, active: () => router.route.name === 'settlements' },
    { label: 'Unity', href: href.unity, active: () => router.route.name === 'unity' },
    { label: 'Electricity', href: href.electricity, active: () => router.route.name === 'electricity' },
    { label: 'Computing', href: href.computing, active: () => router.route.name === 'computing' },
    { label: READ_ONLY ? 'Camera' : 'Console', href: href.console, active: () => router.route.name === 'console' },
  ]
  const currentLabel = $derived(nav.find((i) => i.active())?.label ?? 'Menu')

  // Close the mobile menu when navigating, pressing Esc or clicking outside the bar.
  $effect(() => {
    void router.route
    menuOpen = false
  })
  function onWindowKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && menuOpen) menuOpen = false
  }
  function onWindowClick(e: MouseEvent) {
    if (menuOpen && !bar.contains(e.target as Node)) menuOpen = false
  }

  export async function send(fn: () => Promise<{ ok: boolean; error: string }>) {
    if (busy) return
    busy = true
    commandError = null
    try {
      const res = await fn()
      if (!res.ok) commandError = res.error || 'Command failed'
    } catch (e) {
      commandError = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
      clock.refresh()
    }
  }

  export const togglePause = () => !READ_ONLY && clock.info && send(() => api.pause(!clock.info!.isPaused))
  export const setSpeed = (s: number) => !READ_ONLY && send(() => api.setSpeed(s))
  export const getSpeeds = () => speeds
  export const setSpeedByKey = (key: number) => speeds[key - 1] !== undefined && setSpeed(speeds[key - 1])
</script>

<svelte:window onkeydown={onWindowKey} onclick={onWindowClick} />

<header bind:this={bar} class="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur-sm">
  <div class="flex h-12 items-center gap-2 px-3 sm:px-4 min-[1440px]:gap-6">
    <!-- Below 1100px the page links (seven of them) fold into a menu; the bar keeps a single row. -->
    <Button
      variant="ghost"
      size="icon"
      class="min-[1440px]:hidden"
      aria-expanded={menuOpen}
      aria-controls="main-menu"
      aria-label="Pages, current: {currentLabel}"
      onclick={() => (menuOpen = !menuOpen)}
    >
      {#if menuOpen}<X size={18} aria-hidden="true" />{:else}<Menu size={18} aria-hidden="true" />{/if}
    </Button>

    <nav class="flex h-full items-stretch gap-1 max-[1439px]:hidden" aria-label="Main">
      {#each nav as item (item.href)}
        <a
          class={[
            'relative flex items-center px-2.5 text-sm whitespace-nowrap text-ink-2 transition-colors hover:text-ink',
            'aria-[current=page]:font-semibold aria-[current=page]:text-ink',
            // Current page: a 2px ink rule on the bar's bottom edge.
            'after:absolute after:inset-x-2.5 after:-bottom-px after:h-[3px] after:bg-transparent aria-[current=page]:after:bg-ink',
          ]}
          href={item.href}
          aria-current={item.active() ? 'page' : undefined}>{item.label}</a
        >
      {/each}
    </nav>

    <div class="ml-auto flex items-center gap-2">
      <!-- The period every page shows: one app-wide choice, a native select so it stays compact and works on phones. -->
      <label class="relative flex items-center" title="Period shown on every page">
        <span class="sr-only">Period</span>
        <CalendarRange size={15} class="pointer-events-none absolute left-2 text-ink-2 max-sm:hidden" aria-hidden="true" />
        <select
          class="h-8 cursor-pointer appearance-none rounded-ui border border-line-strong bg-surface py-0 pr-7 pl-2 text-sm font-medium text-ink hover:bg-surface-2 sm:pl-7"
          value={globalPeriod.value}
          onchange={(e) => globalPeriod.set(e.currentTarget.value as FlowPeriod)}
        >
          {#each PERIODS as [value, label] (value)}<option {value}>{label}</option>{/each}
        </select>
        <ChevronDown size={14} class="pointer-events-none absolute right-2 text-ink-2" aria-hidden="true" />
      </label>
      {#if clock.info}
        {@const info = clock.info}
        <span
          class="mr-1 text-sm font-semibold whitespace-nowrap tabular-nums font-stretch-87.5% max-sm:hidden"
          title="Tick {info.tick}">{formatGameDate(parseGameDate(info.date))}</span
        >
        {#if READ_ONLY}
          <!-- No controls: the state only. -->
          <span
            class={[
              'rounded-ui px-2 py-1 text-sm font-medium whitespace-nowrap tabular-nums',
              info.isPaused ? 'bg-signal text-signal-ink' : 'text-ink-2',
            ]}
            title="Read-only: game controls are off">{info.isPaused ? 'Paused' : `${info.speed}×`}</span
          >
        {:else}
        <Button
          variant={info.isPaused ? 'signal' : 'default'}
          size="icon"
          disabled={busy}
          onclick={togglePause}
          title="{info.isPaused ? 'Resume' : 'Pause'} (Space)"
          aria-label={info.isPaused ? 'Resume game' : 'Pause game'}
        >
          {#if info.isPaused}
            <Play size={15} class="fill-current" aria-hidden="true" />
          {:else}
            <Pause size={15} class="fill-current" aria-hidden="true" />
          {/if}
        </Button>
        <Segmented
          label="Game speed"
          options={speedOptions}
          value={speeds.includes(info.speed) ? info.speed : null}
          onchange={setSpeed}
          disabled={busy}
        />
        {#if !speeds.includes(info.speed)}
          <span class="text-sm text-ink-2 tabular-nums" title="Current speed">{info.speed}×</span>
        {/if}
        {/if}
      {/if}

      <!-- Connection state: shape + color (never color alone), explained in the tooltip. -->
      <Tooltip align="end">
        {#snippet trigger(id)}
          <button
            type="button"
            class="inline-grid size-8 cursor-pointer place-items-center rounded-ui hover:bg-surface-2"
            aria-label="Connection: {STATUS[status].label}. Check now"
            aria-describedby={id}
            onclick={clock.refresh}
          >
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" class="block overflow-visible">
              {#if status === 'live'}
                <circle cx="9" cy="9" r="6" class="fill-good" />
                <circle cx="9" cy="9" r="6" class="origin-center animate-ping fill-good opacity-60 motion-reduce:hidden" />
              {:else if status === 'paused'}
                <circle cx="9" cy="9" r="5.5" class="fill-none stroke-warning" stroke-width="3" />
              {:else}
                <path d="M4 4l10 10M14 4L4 14" class="stroke-critical" stroke-width="3" stroke-linecap="round" />
              {/if}
            </svg>
          </button>
        {/snippet}
        <strong class="block font-semibold text-ink">{STATUS[status].label}</strong>
        {STATUS[status].text}
      </Tooltip>

      <div class="flex items-center gap-1 max-[1439px]:hidden">
        <!-- One button that cycles auto, light, dark (the menu on narrow screens has all three). -->
        <Button
          variant="ghost"
          size="icon"
          onclick={() => theme.set(nextTheme.value)}
          title="{currentTheme.title}. Click for {nextTheme.label.toLowerCase()}"
          aria-label="Theme: {currentTheme.label}. Switch to {nextTheme.label}"
        >
          <currentTheme.icon size={17} aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon" onclick={onHelp} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
          <Keyboard size={17} aria-hidden="true" />
        </Button>
      </div>
    </div>
  </div>

  {#if menuOpen}
    <nav
      id="main-menu"
      class="absolute inset-x-0 top-full flex flex-col gap-0.5 border-b border-line bg-surface p-2 shadow-lg min-[1440px]:hidden"
      aria-label="Main"
    >
      {#each nav as item (item.href)}
        <a
          class={[
            'flex min-h-11 items-center rounded-ui px-3 text-base text-ink-2 hover:bg-surface-2 hover:text-ink',
            'aria-[current=page]:bg-sel aria-[current=page]:font-semibold aria-[current=page]:text-sel-ink',
          ]}
          href={item.href}
          aria-current={item.active() ? 'page' : undefined}>{item.label}</a
        >
      {/each}
      <div class="mt-2 flex items-center justify-between gap-3 border-t border-line px-3 pt-3 pb-1">
        <span class="text-sm text-ink-2">Theme</span>
        <Segmented label="Theme" options={THEME_OPTIONS} value={theme.preference} onchange={(t) => theme.set(t)} />
      </div>
    </nav>
  {/if}

  <!-- Paused: hazard stripes along the bar's bottom edge, the page-wide "the game is stopped" signal. -->
  {#if status === 'paused'}
    <div class="hazard absolute inset-x-0 -bottom-px h-1" aria-hidden="true"></div>
  {/if}
</header>
{#if commandError}
  <div
    class="flex items-center justify-center gap-4 border-b border-critical bg-surface px-4 py-2 text-sm text-critical"
    role="alert"
  >
    Command failed: {commandError}
    <Button size="sm" onclick={() => (commandError = null)}>Dismiss</Button>
  </div>
{/if}
