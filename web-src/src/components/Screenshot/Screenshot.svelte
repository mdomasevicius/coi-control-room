<script lang="ts">
  import Maximize2 from '@lucide/svelte/icons/maximize-2'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import CircleX from '@lucide/svelte/icons/circle-x'
  import { api } from '@/logic/api/client'
  import { load, save } from '@/lib/storage'
  import Button from '@/components/Button/Button.svelte'
  import Segmented, { type SegmentOption } from '@/components/Segmented/Segmented.svelte'

  // Live camera view, framed like a monitor: the picture gets the space, controls float on it. Each frame is
  // fetched as a blob and preloaded off-screen before it's swapped in (no flicker), and the next one is only
  // requested after the previous arrived (no pile-up on slow frames).
  const INTERVALS: SegmentOption<number>[] = [
    { value: 0, label: 'Off', title: 'No auto refresh' },
    { value: 2000, label: '2s', title: 'Refresh every 2 seconds' },
    { value: 5000, label: '5s', title: 'Refresh every 5 seconds' },
    { value: 15000, label: '15s', title: 'Refresh every 15 seconds' },
  ]
  const WIDTHS = [640, 960, 1280, 1920]

  let interval = $state<number>(load('shot.interval', 5000))
  let width = $state<number>(load('shot.width', 960))
  let src = $state<string | null>(null)
  let error = $state<string | null>(null)
  let loading = $state(false)
  let takenAt = $state<Date | null>(null)

  $effect(() => save('shot.interval', interval))
  $effect(() => save('shot.width', width))

  // The game stretches the image to the requested size, and a missing height means the full window height,
  // so learn the window's aspect ratio from one full-size frame and request matching heights after that.
  let aspect: number | null = null

  let timer: ReturnType<typeof setTimeout> | undefined
  let alive = true

  /** The previous frame's object URL is revoked as soon as the next one is on screen. */
  function release(url: string | null) {
    if (url && url !== src) URL.revokeObjectURL(url)
  }

  async function grab() {
    clearTimeout(timer)
    if (!alive) return
    if (document.visibilityState === 'hidden') {
      schedule()
      return
    }
    loading = true
    const url = aspect ? api.screenshotUrl(width, Math.round(width / aspect)) : api.screenshotUrl()
    let objectUrl: string | null = null
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(String(res.status))
      objectUrl = URL.createObjectURL(await res.blob())
      const img = new Image()
      img.src = objectUrl
      await img.decode()
      if (!alive) throw new Error('unmounted')
      if (!aspect && img.naturalHeight) aspect = img.naturalWidth / img.naturalHeight
      const previous = src
      src = objectUrl
      takenAt = new Date()
      error = null
      release(previous)
    } catch {
      if (objectUrl && objectUrl !== src) URL.revokeObjectURL(objectUrl)
      if (alive) error = 'No picture. Is the game running?'
    } finally {
      loading = false
      schedule()
    }
  }

  function schedule() {
    clearTimeout(timer)
    if (alive && interval > 0) timer = setTimeout(grab, interval)
  }

  $effect(() => {
    // Re-grab immediately when the size or interval changes.
    void interval
    void width
    void grab()
  })

  $effect(() => () => {
    alive = false
    clearTimeout(timer)
    if (src) URL.revokeObjectURL(src)
  })

  // Overlay chips sit on an arbitrary picture: an opaque-ish token surface keeps them readable in both themes.
  const CHIP = 'rounded-ui border border-line bg-surface/90 shadow-sm backdrop-blur-sm'
</script>

<section class="min-w-0 overflow-hidden rounded-ui border border-line bg-surface">
  <header class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2">
    <h2 class="text-sm font-semibold">Camera</h2>
    <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
      <Segmented label="Auto refresh" size="sm" options={INTERVALS} value={interval} onchange={(ms) => (interval = ms)} />
      <label class="sr-only" for="shot-width">Picture width</label>
      <select id="shot-width" class="h-7 text-xs" bind:value={width} title="Picture width">
        {#each WIDTHS as w (w)}<option value={w}>{w}px</option>{/each}
      </select>
    </div>
  </header>

  <div class="relative bg-bg">
    {#if src}
      <img class="block h-auto w-full" {src} alt="Current in-game camera view" />
    {:else}
      <div class="grid aspect-video place-items-center px-4 text-center text-sm text-muted">{error ?? 'Loading…'}</div>
    {/if}

    {#if src}
      <div class="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
        <span class={[CHIP, 'flex items-center gap-1.5 px-2 py-1 text-xs text-ink-2 tabular-nums']}>
          {#if error}
            <CircleX size={14} class="text-critical" aria-hidden="true" />{error}
          {:else if takenAt}
            {takenAt.toLocaleTimeString()}
          {/if}
        </span>
        <span class="flex gap-1.5">
          <Button
            size="icon-sm"
            class={CHIP}
            onclick={() => ((aspect = null), void grab())}
            disabled={loading}
            title="Take a picture now"
            aria-label="Take a picture now"
          >
            <RefreshCw size={15} class={loading ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
          </Button>
          <a
            class={[CHIP, 'inline-grid size-7 place-items-center text-ink hover:bg-surface-2']}
            href={api.screenshotUrl()}
            target="_blank"
            rel="noopener"
            title="Open full size"
            aria-label="Open full size in a new tab"
          >
            <Maximize2 size={15} aria-hidden="true" />
          </a>
        </span>
      </div>
    {/if}
  </div>

</section>
