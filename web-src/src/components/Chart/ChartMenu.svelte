<script lang="ts">
  import ChartColumn from '@lucide/svelte/icons/chart-column'
  import ChartLine from '@lucide/svelte/icons/chart-line'
  import Download from '@lucide/svelte/icons/download'
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal'
  import Segmented, { type SegmentOption } from '@/components/Segmented/Segmented.svelte'
  import { chartPrefs, type ChartKind, type ChartScale } from '@/logic/chartPrefs.svelte'
  import { downloadCsv, type CsvTable } from '@/lib/csv'

  // A chart's view options behind one button: y scale, line or bar (both app-wide preferences) and the CSV download.
  // The button names a non-linear scale, so a Log or √ axis is never mistaken for a linear one.
  let { name, table }: { name: string; table: () => CsvTable } = $props()

  const KIND_OPTIONS: SegmentOption<ChartKind>[] = [
    { value: 'line', label: 'Line chart', icon: ChartLine },
    { value: 'bar', label: 'Bar chart', icon: ChartColumn },
  ]
  const SCALE_OPTIONS: SegmentOption<ChartScale>[] = [
    { value: 'linear', label: 'Lin', title: 'Linear scale' },
    { value: 'log', label: 'Log', title: 'Log scale (zero months still show)' },
    { value: 'sqrt', label: '√', title: 'Square-root scale' },
  ]
  const SCALE_BADGE: Record<ChartScale, string> = { linear: '', log: 'Log', sqrt: '√' }

  const id = $props.id()
  let button: HTMLButtonElement
  let menu: HTMLDivElement

  // The menu is a native popover (top layer, closes on Escape or a click outside); place it under the button,
  // right-aligned, and above it when there's no room below.
  function place(e: ToggleEvent) {
    if (e.newState !== 'open') return
    const r = button.getBoundingClientRect()
    const h = menu.offsetHeight
    const below = r.bottom + 6 + h <= innerHeight
    menu.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)}px`
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth)}px`
  }
</script>

<button
  bind:this={button}
  type="button"
  popovertarget={id}
  class="inline-flex h-7 cursor-pointer items-center gap-1 rounded-ui px-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink motion-reduce:transition-none"
  aria-label="Chart options"
  title="Scale, chart type, download"
>
  {#if SCALE_BADGE[chartPrefs.scale]}<span class="tabular-nums">{SCALE_BADGE[chartPrefs.scale]}</span>{/if}
  <SlidersHorizontal size={15} aria-hidden="true" />
</button>

<div
  bind:this={menu}
  {id}
  popover="auto"
  ontoggle={place}
  class="fixed m-0 flex-col gap-3 rounded-ui border border-line-strong bg-surface p-3 text-sm text-ink-2 shadow-lg open:flex"
>
  <div class="flex items-center justify-between gap-4">
    <span>Scale</span>
    <Segmented label="Scale" size="sm" options={SCALE_OPTIONS} value={chartPrefs.scale} onchange={(s) => chartPrefs.setScale(s)} />
  </div>
  <div class="flex items-center justify-between gap-4">
    <span>Type</span>
    <Segmented label="Chart type" size="sm" iconOnly options={KIND_OPTIONS} value={chartPrefs.kind} onchange={(k) => chartPrefs.set(k)} />
  </div>
  <p class="-mt-1 text-2xs text-muted">Applies to every chart.</p>
  <button
    type="button"
    class="-mx-1 flex cursor-pointer items-center gap-2 rounded-ui border-t border-line px-1 pt-2.5 pb-0.5 text-left hover:text-ink"
    onclick={() => {
      downloadCsv(name, table())
      menu.hidePopover()
    }}
  >
    <Download size={15} aria-hidden="true" />Download CSV
  </button>
</div>
