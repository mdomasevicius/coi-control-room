<script lang="ts">
  import CloudFog from '@lucide/svelte/icons/cloud-fog'
  import CornerDownLeft from '@lucide/svelte/icons/corner-down-left'
  import Eraser from '@lucide/svelte/icons/eraser'
  import Gauge from '@lucide/svelte/icons/gauge'
  import Mountain from '@lucide/svelte/icons/mountain'
  import Check from '@lucide/svelte/icons/check'
  import X from '@lucide/svelte/icons/x'
  import { tick } from 'svelte'
  import { formatGameDate, parseGameDate } from '@/logic/api/gameDate'
  import Button from '@/components/Button/Button.svelte'
  import { getClock } from '@/lib/live/context'
  import { load, save } from '@/lib/storage'
  import { consoleLog } from './consoleLog.svelte'

  /**
   * One surface like a real shell: the transcript scrolls above, quick actions and the prompt sit at the bottom.
   * Up / down recall earlier lines.
   */
  const clock = getClock()

  const QUICK = [
    { command: 'set_game_speed 15', label: 'Speed 15×', icon: Gauge },
    { command: 'toggle_fog_rendering', label: 'Fog', icon: CloudFog },
    { command: 'camera_toggle_terrain_clip_check', label: 'Terrain clip', icon: Mountain },
  ]

  let line = $state('')
  let history = $state<string[]>(load('console.history', []))
  let historyIdx = $state(-1)
  let scroller: HTMLOListElement | undefined = $state()

  const now = () => clock.info?.date ?? ''
  const gameTime = (at: string) => (at ? formatGameDate(parseGameDate(at)) : '')

  async function send(cmd: string) {
    const done = consoleLog.console(cmd, now())
    await scrollToEnd()
    await done
    clock.refresh()
    await scrollToEnd()
  }

  async function scrollToEnd() {
    await tick()
    scroller?.scrollTo({ top: scroller.scrollHeight })
  }

  function submit(e: SubmitEvent) {
    e.preventDefault()
    const cmd = line.trim()
    if (!cmd || consoleLog.busy) return
    history = [cmd, ...history.filter((h) => h !== cmd)].slice(0, 50)
    save('console.history', history)
    historyIdx = -1
    line = ''
    void send(cmd)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault()
      historyIdx = Math.min(history.length - 1, historyIdx + 1)
      line = history[historyIdx]
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      historyIdx = Math.max(-1, historyIdx - 1)
      line = historyIdx === -1 ? '' : history[historyIdx]
    }
  }

  $effect(() => {
    void scrollToEnd()
  })
</script>

<section class="flex min-w-0 flex-col overflow-hidden rounded-ui border border-line bg-surface">
  <header class="flex min-h-11 items-center gap-3 border-b border-line px-4 py-2">
    <h2 class="text-sm font-semibold">Game console</h2>
    {#if consoleLog.entries.length}
      <Button size="sm" variant="ghost" class="ml-auto" onclick={() => consoleLog.clear()} title="Clear the output">
        <Eraser size={15} aria-hidden="true" />Clear
      </Button>
    {/if}
  </header>

  <!-- Transcript: inset one step darker than the panel, like a screen in a bezel. -->
  <ol
    bind:this={scroller}
    class="flex h-72 flex-col gap-0.5 overflow-y-auto bg-bg px-4 py-3 font-mono text-sm sm:h-96"
    aria-label="Console output"
    aria-live="polite"
  >
    {#each consoleLog.entries as e (e.id)}
      <li class="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-2 py-1">
        <span class="mt-0.5" aria-label={e.ok === null ? 'Running' : e.ok ? 'Done' : 'Failed'}>
          {#if e.ok === null}
            <span class="inline-block size-3 animate-pulse rounded-full bg-muted motion-reduce:animate-none"></span>
          {:else if e.ok}
            <Check size={16} strokeWidth={2.75} class="text-good" aria-hidden="true" />
          {:else}
            <X size={16} strokeWidth={2.75} class="text-critical" aria-hidden="true" />
          {/if}
        </span>
        <span class="min-w-0">
          <span class="text-ink wrap-anywhere"
            ><span class="text-muted select-none">{e.kind === 'console' ? '> ' : '$ '}</span>{e.label}</span
          >
          {#if e.detail}<span class="block font-sans text-xs text-ink-2 wrap-anywhere">{e.detail}</span>{/if}
        </span>
        <span class="font-sans text-2xs whitespace-nowrap text-muted tabular-nums">{gameTime(e.at)}</span>
      </li>
    {:else}
      <li class="m-auto max-w-xs text-center font-sans text-sm text-muted">
        Type a console command below, or use a quick action. They run in your save.
      </li>
    {/each}
  </ol>

  <div class="flex flex-col gap-3 border-t border-line p-3">
    <div class="flex flex-wrap gap-2" role="group" aria-label="Quick actions">
      {#each QUICK as q (q.command)}
        <Button size="sm" disabled={consoleLog.busy} onclick={() => send(q.command)} title={q.command}>
          <q.icon size={15} aria-hidden="true" />{q.label}
        </Button>
      {/each}
    </div>
    <form class="flex items-center gap-2" onsubmit={submit}>
      <label class="sr-only" for="console-input">Console command</label>
      <div class="relative min-w-0 flex-1">
        <span
          class="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-sm font-semibold text-muted"
          aria-hidden="true">&gt;</span
        >
        <input
          id="console-input"
          type="text"
          class="h-10 w-full pl-7 font-mono text-sm"
          bind:value={line}
          onkeydown={onKey}
          placeholder="web_api_start"
          title="Up and down arrows recall earlier commands"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </div>
      <Button type="submit" class="h-10" disabled={consoleLog.busy || !line.trim()} aria-label="Run command">
        <CornerDownLeft size={16} aria-hidden="true" />Run
      </Button>
    </form>
  </div>
</section>
