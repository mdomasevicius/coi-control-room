<script lang="ts" module>
  export interface ChartSeries {
    label: string
    values: (number | null)[]
    /** CSS custom property holding the color, e.g. '--series-produced'. */
    color: string
    /**
     * A part of another series, e.g. "in storage" within quantity: a dashed line, and in bar mode a narrower bar drawn
     * inside the stack instead of stacked on top (stacking a subset would double-count it).
     */
    dash?: boolean
  }
</script>

<script lang="ts">
  import uPlot from 'uplot'
  import 'uplot/dist/uPlot.min.css'
  import { untrack } from 'svelte'
  import { fade } from 'svelte/transition'
  import { theme } from '@/logic/theme.svelte'
  import { chartPrefs } from '@/logic/chartPrefs.svelte'
  import { formatNumber } from '@/lib/format'
  import ChartMenu from './ChartMenu.svelte'
  import { diffAreas } from '@/lib/diffAreas'

  // One y-axis from 0 (never dual-axis: different measures get their own chart). x is the period index;
  // `labels` names each period. The legend doubles as the live readout for the hovered period. Line or bar is a
  // global preference (chartPrefs): the toggle on any chart switches every chart.
  let {
    labels: rawLabels,
    series: rawSeries,
    height = 220,
    lastInProgress = false,
    format = formatNumber,
    ariaLabel,
  }: {
    labels: string[]
    series: ChartSeries[]
    height?: number
    lastInProgress?: boolean
    format?: (n: number) => string
    ariaLabel: string
  } = $props()

  const LINE_WIDTH = 2
  const DASH = [6, 4]

  let wrap: HTMLDivElement
  let plotEl: HTMLDivElement
  let chart: uPlot | null = null
  let currentLabels: string[] = []

  let hoverIdx = $state<number | null>(null)
  let tip = $state({ left: 0, top: 0, flip: false })
  /** Series under the pointer (index into `series`): nearest line, or the stacked segment the pointer is over. */
  let focusIdx = $state<number | null>(null)
  /** The hovered period's column, highlighted behind the marks. */
  let band = $state<{ left: number; top: number; width: number; height: number } | null>(null)
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  // Line mode leaves the period in progress out: a month that has just begun always plots as a crash to zero.
  // Bars keep it, shaded, since a short bar reads as "not done yet".
  const cut = $derived(lastInProgress && chartPrefs.kind !== 'bar' && rawLabels.length >= 2)
  const labels = $derived(cut ? rawLabels.slice(0, -1) : rawLabels)
  const allSeries: ChartSeries[] = $derived(cut ? rawSeries.map((s) => ({ ...s, values: s.values.slice(0, -1) })) : rawSeries)
  /** Shaded in-progress period: bars only. */
  const shadeLast = $derived(lastInProgress && !cut)

  // Clicking a legend entry shows only that series (and the y-axis rescales to it); clicking it again shows all.
  // Kept by label, so it survives data refreshes; if the series disappears, everything shows again.
  let isolated = $state<string | null>(null)
  const series: ChartSeries[] = $derived.by(() => {
    const only = isolated === null ? [] : allSeries.filter((s) => s.label === isolated)
    return only.length ? only : allSeries
  })
  const toggleIsolate = (label: string) => (isolated = isolated === label ? null : label)

  const kind = $derived(chartPrefs.kind)
  const scale = $derived(chartPrefs.scale)
  const n = $derived(labels.length)
  const structure = $derived(
    `${series.map((s) => s.label + s.color + (s.dash ?? '')).join('|')}#${theme.resolved}#${height}#${n <= 31}#${kind}#${scale}#${shadeLast}`,
  )
  // Bar mode stacks every series into one bar per period (first series at the bottom). uPlot draws series in order,
  // so stacked series are fed as running totals, tallest first, each painting over the one before; subset (dash)
  // series come last, unstacked. Legend and tooltip read the original values, not these totals.
  const order = $derived.by(() => {
    if (kind !== 'bar') return series.map((_, i) => i)
    const stacked = series.flatMap((s, i) => (s.dash ? [] : [i]))
    const subsets = series.flatMap((s, i) => (s.dash ? [i] : []))
    return [...stacked.reverse(), ...subsets]
  })
  const data = $derived.by(() => {
    const xs = labels.map((_, i) => i)
    if (kind !== 'bar') return [xs, ...series.map((s) => s.values)] as uPlot.AlignedData
    const totals = new Map<number, number[]>()
    let running = xs.map(() => 0)
    series.forEach((s, i) => {
      if (s.dash) return
      running = running.map((sum, x) => sum + (s.values[x] ?? 0))
      totals.set(i, running)
    })
    return [xs, ...order.map((i) => totals.get(i) ?? series[i].values)] as uPlot.AlignedData
  })
  /** The latest finished period: the legend's default readout, and where each line carries its dot. */
  const lastIdx = $derived(shadeLast && n >= 2 ? n - 2 : n - 1)
  const readIdx = $derived(hoverIdx ?? lastIdx)
  /** Produced vs consumed: the gap between the two lines is filled with whichever leads. */
  const flowPair = $derived(
    kind !== 'bar' && series.length === 2 && series[0].color === '--series-produced' && series[1].color === '--series-consumed',
  )
  const stackedIdx = $derived(series.flatMap((s, i) => (s.dash ? [] : [i])))
  // Tooltip rows follow the picture: in bar mode the top segment first, subsets last.
  const tipOrder = $derived(kind === 'bar' ? order : series.map((_, i) => i))
  const showTotal = $derived(kind === 'bar' && stackedIdx.length > 1)

  /** Stacked segment containing value y at period idx (bottom-up running totals), or null above the stack. */
  function segmentAt(idx: number, y: number): number | null {
    if (y < 0) return null
    let sum = 0
    for (const i of stackedIdx) {
      sum += series[i].values[idx] ?? 0
      if (y <= sum) return i
    }
    return null
  }

  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '–' : format(v))

  function css(name: string) {
    return getComputedStyle(wrap).getPropertyValue(name).trim() || '#888'
  }

  // Canvas fills take plain colors; tokens resolve to hex, so build a translucent rgba from it.
  function translucent(color: string, alpha: number) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
    return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})` : color
  }

  /** Smallest gap between y-axis labels on the Log / √ scales, in CSS px (13px text plus air). */
  const MIN_TICK_GAP = 28

  // uPlot's tick finder steps evenly through the *transformed* scale, which on Log / √ lands on values it then
  // can't label (null), so those axes came out blank. Instead: round 1-2-5 values (0, 1, 2, 5, 10, 20, 50, …) up
  // to the top of the scale, placed through the scale itself and thinned bottom-up to keep MIN_TICK_GAP apart.
  function nonLinearSplits(u: uPlot, _axisIdx: number, _min: number, max: number): number[] {
    if (!(max > 0)) return [0]
    const candidates = [0]
    for (let decade = 10 ** (Math.floor(Math.log10(max)) - 3); decade <= max; decade *= 10) {
      for (const k of [1, 2, 5]) if (k * decade <= max) candidates.push(k * decade)
    }
    const kept: number[] = []
    let lastPos = Infinity
    for (const v of candidates) {
      const pos = u.valToPos(v, 'y')
      if (lastPos - pos >= MIN_TICK_GAP) {
        kept.push(v)
        lastPos = pos
      }
    }
    return kept
  }

  // Under the lines (drawAxes runs before series): the produced/consumed gap, or a soft area under a lone line.
  function drawFills(u: uPlot) {
    if (kind === 'bar') return
    const ctx = u.ctx
    const X = (i: number) => u.valToPos(i, 'x', true)
    const Y = (v: number) => u.valToPos(v, 'y', true)
    ctx.save()
    if (flowPair) {
      for (const a of diffAreas(series[0].values, series[1].values)) {
        ctx.beginPath()
        a.points.forEach(([i, v], k) => (k ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))))
        ctx.closePath()
        ctx.fillStyle = translucent(css(a.aAbove ? '--series-produced' : '--series-consumed'), 0.16)
        ctx.fill()
      }
    } else if (series.length === 1 && !series[0].dash) {
      const values = series[0].values
      const pts = values.flatMap((v, i) => (v === null ? [] : [[i, v] as const]))
      if (pts.length > 1) {
        const color = css(series[0].color)
        const g = ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height)
        g.addColorStop(0, translucent(color, 0.16))
        g.addColorStop(1, translucent(color, 0))
        const base = Y(0)
        ctx.beginPath()
        ctx.moveTo(X(pts[0][0]), base)
        for (const [i, v] of pts) ctx.lineTo(X(i), Y(v))
        ctx.lineTo(X(pts[pts.length - 1][0]), base)
        ctx.closePath()
        ctx.fillStyle = g
        ctx.fill()
      }
    }
    // Baseline: the zero line a notch stronger than the grid.
    ctx.strokeStyle = css('--border-strong')
    ctx.lineWidth = 1
    const y0 = Math.round(Y(0)) + 0.5
    ctx.beginPath()
    ctx.moveTo(u.bbox.left, y0)
    ctx.lineTo(u.bbox.left + u.bbox.width, y0)
    ctx.stroke()
    ctx.restore()
  }

  /**
   * Period labels as two tiers: the short unit on top ("M4") and its year underneath, only where the year starts or
   * on the first label, so "Y2846" isn't repeated under every month. Labels without a space ("Y2846") stay as is.
   */
  function tickLabels(splits: number[]): string[] {
    let prevYear: string | null = null
    return splits.map((v) => {
      const l = Number.isInteger(v) ? currentLabels[v] : undefined
      if (!l) return ''
      const m = /^(.*) (\S+)$/.exec(l)
      if (!m) return l
      const year = m[1]
      const out = year !== prevYear ? `${m[2]}\n${year}` : m[2]
      prevYear = year
      return out
    })
  }

  // Stack segments share one width; a subset bar sits inside its stack, narrower.
  const stackBars = () => uPlot.paths.bars!({ align: 0, size: [0.6, 36] })
  const subsetBars = () => uPlot.paths.bars!({ align: 0, size: [0.28, 16] })

  function create(): uPlot {
    // Axis text: --muted, in the page font (Archivo). Grid: the recessive --grid hairline.
    const family = getComputedStyle(wrap).fontFamily || '"Archivo Variable", system-ui, sans-serif'
    const font = `13px ${family}`
    const axis = { stroke: css('--muted'), font, ticks: { show: false }, border: { show: false } }
    const bars = kind === 'bar'
    // Ticks show the short unit ("M10", or "Y2847" by year): space them and pad the right edge for the longest one
    // (about 7px a character at 13px), so labels neither touch nor get clipped at the end.
    const twoTier = labels.length > 0 && labels.every((l) => l.includes(' '))
    const labelWidth = Math.max(0, ...labels.map((l) => (twoTier ? l.slice(l.lastIndexOf(' ') + 1) : l).length)) * 7
    const yearWidth = twoTier ? Math.max(0, ...labels.map((l) => l.lastIndexOf(' '))) * 7 : 0
    const opts: uPlot.Options = {
      width: plotEl.clientWidth || 600,
      height,
      padding: [12, Math.max(20, Math.ceil(Math.max(labelWidth, yearWidth) / 2) + 4), 0, 0],
      scales: {
        x: { time: false, ...(bars ? { range: (_u, min, max) => [min - 0.5, max + 0.5] } : {}) },
        y: {
          range: (_u, _min, max) => [0, max > 0 ? max * 1.08 : 1],
          // Log uses asinh (log-like for big values, linear near 0) so months with zero still plot.
          ...(scale === 'log' ? { distr: 4, log: 10, asinh: 1 } : {}),
          ...(scale === 'sqrt' ? { distr: 100, fwd: (v: number) => Math.sqrt(Math.max(0, v)), bwd: (v: number) => v * v } : {}),
        },
      },
      axes: [
        {
          ...axis,
          grid: { show: false },
          size: twoTier ? 46 : 30,
          gap: 8,
          space: Math.max(44, labelWidth + 20, twoTier ? yearWidth / 2 + 8 : 0),
          incrs: [1, 2, 3, 4, 6, 12, 24, 48, 96],
          values: (_u, splits) => tickLabels(splits),
        },
        {
          ...axis,
          size: 56,
          space: 36,
          grid: { stroke: css('--grid'), width: 1 },
          // uPlot's default filter on non-linear scales blanks every label that isn't a power of 10; these ticks
          // are already chosen to be labelled, so keep them all.
          ...(scale === 'linear' ? {} : { splits: nonLinearSplits, filter: (_u: uPlot, splits: number[]) => splits }),
          values: (_u, vals) => vals.map((v) => (v === null || v === undefined ? '' : format(v))),
        },
      ],
      series: [
        {},
        ...order.map((i) => {
          const s = series[i]
          const color = css(s.color)
          return bars
            ? {
                label: s.label,
                // A surface-colored outline leaves a 2px gap between stacked segments.
                stroke: css('--surface'),
                // The subset is a lighter core cut into its stack (surface tint), visible on any bar color.
                fill: s.dash ? translucent(css('--surface'), 0.55) : color,
                width: s.dash ? 0 : 2,
                paths: s.dash ? subsetBars() : stackBars(),
                points: { show: false },
              }
            : {
                label: s.label,
                stroke: color,
                width: s.dash ? LINE_WIDTH - 0.5 : LINE_WIDTH,
                dash: s.dash ? DASH : undefined,
                // One dot, on the latest finished value, ringed in the surface color where lines cross.
                points: {
                  show: !s.dash,
                  size: 9,
                  width: 2,
                  fill: color,
                  stroke: css('--surface'),
                  filter: () => [lastIdx],
                },
              }
        }),
      ],
      legend: { show: false },
      // Lines: the series nearest the pointer stays solid, the others dim (Grafana-style focus).
      focus: { alpha: 0.3 },
      cursor: {
        y: false,
        // Bars get the column band instead of a crosshair line.
        x: !bars,
        drag: { x: false, y: false, setScale: false },
        focus: { prox: bars ? -1 : 30 },
        points: bars ? { show: false } : { size: 11, width: 2.5, fill: css('--surface') },
      },
      hooks: {
        drawAxes: [drawFills],
        drawClear: [
          (u) => {
            if (!shadeLast || currentLabels.length < 2) return
            // Shade the period in progress: its values are still growing.
            const ctx = u.ctx
            const x0 = u.valToPos(currentLabels.length - 1.5, 'x', true)
            ctx.save()
            ctx.fillStyle = css('--band')
            ctx.fillRect(x0, u.bbox.top, u.bbox.left + u.bbox.width - x0, u.bbox.height)
            ctx.restore()
          },
        ],
        setCursor: [
          (u) => {
            const idx = u.cursor.idx
            hoverIdx = idx ?? null
            if (idx === null || idx === undefined) {
              band = null
              if (bars) focusIdx = null
              return
            }
            const overW = u.over.clientWidth
            const overH = u.over.clientHeight
            const x0 = Math.max(0, u.valToPos(idx - 0.5, 'x'))
            const x1 = Math.min(overW, u.valToPos(idx + 0.5, 'x'))
            band = { left: u.over.offsetLeft + x0, top: u.over.offsetTop, width: Math.max(2, x1 - x0), height: overH }
            const top = u.cursor.top ?? 0
            if (bars) focusIdx = segmentAt(idx, u.posToVal(top, 'y'))
            const left = (u.cursor.left ?? 0) + u.over.offsetLeft
            // Keep the tooltip inside the plot vertically.
            const clamped = Math.min(Math.max(top, 48), overH - 48)
            tip = { left, top: clamped + u.over.offsetTop, flip: left > plotEl.clientWidth * 0.6 }
          },
        ],
        setSeries: [
          (_u, sIdx, opts) => {
            // uPlot passes { focus } here on focus changes; its types don't declare it.
            if (bars || (opts as { focus?: boolean }).focus === undefined) return
            focusIdx = sIdx === null || sIdx === undefined ? null : (order[sIdx - 1] ?? null)
          },
        ],
      },
    }
    currentLabels = labels
    return new uPlot(opts, data, plotEl)
  }

  // (Re)create when the series set, theme or chart kind changes; otherwise just push new data.
  $effect(() => {
    void structure
    const u = untrack(create)
    chart = u
    return () => {
      u.destroy()
      chart = null
    }
  })

  $effect(() => {
    const d = data
    currentLabels = labels
    untrack(() => chart?.setData(d))
  })

  $effect(() => {
    const ro = new ResizeObserver(() => chart?.setSize({ width: plotEl.clientWidth, height }))
    ro.observe(plotEl)
    return () => ro.disconnect()
  })
</script>

{#snippet swatch(s: ChartSeries)}
  <span
    class="h-1 w-4 flex-none self-center rounded-full"
    style:background={s.dash
      ? `repeating-linear-gradient(90deg, var(${s.color}) 0 5px, transparent 5px 8px)`
      : `var(${s.color})`}
  ></span>
{/snippet}

<div class="min-w-0" bind:this={wrap}>
  <!-- Legend = live readout: values of the hovered period, or of the latest one. The focused series stays bright. -->
  <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
    {#each allSeries as s (s.label)}
      {@const i = series.indexOf(s)}
      {@const hidden = i === -1}
      {@const cls = [
        'inline-flex items-center gap-1.5 transition-opacity duration-100 motion-reduce:transition-none',
        (hidden || (focusIdx !== null && focusIdx !== i)) && 'opacity-45',
        focusIdx === i && 'text-ink',
      ]}
      {#if allSeries.length > 1}
        <button
          type="button"
          class={[cls, '-mx-1 cursor-pointer rounded-ui px-1 hover:bg-surface-2']}
          aria-pressed={isolated === s.label}
          title={isolated === s.label ? 'Show all' : `Show only ${s.label}`}
          onclick={() => toggleIsolate(s.label)}
        >
          {@render swatch(s)}
          {s.label}
          <span class="font-semibold text-ink tabular-nums">{fmt(s.values[readIdx])}</span>
        </button>
      {:else}
        <span class={cls}>
          {@render swatch(s)}
          {s.label}
          <span class="font-semibold text-ink tabular-nums">{fmt(s.values[readIdx])}</span>
        </span>
      {/if}
    {/each}
    <span class="ml-auto flex items-center gap-2">
      <span class="text-2xs text-muted tabular-nums">{labels[readIdx] ?? ''}</span>
      <ChartMenu
        name={ariaLabel}
        table={() => ({
          header: ['Period', ...rawSeries.map((s) => s.label)],
          rows: rawLabels.map((l, i) => [
            lastInProgress && i === rawLabels.length - 1 ? `${l} (in progress)` : l,
            ...rawSeries.map((s) => s.values[i]),
          ]),
        })}
      />
    </span>
  </div>
  <div
    class={[
      'relative [&_.u-over]:cursor-crosshair',
      // uPlot draws the cursor line dashed slate; make it a solid, clearly visible token line.
      '[&_.u-cursor-x]:border-solid! [&_.u-cursor-x]:border-ink-2!',
    ]}
    bind:this={plotEl}
    onmouseleave={() => ((band = null), (focusIdx = null))}
    role="img"
    aria-label={ariaLabel}
  >
    {#if band}
      <!-- Hovered period: a soft column over the marks, so it's obvious which period the readout belongs to. -->
      <div
        class="pointer-events-none absolute z-1 rounded-[3px] bg-(--hover)"
        style:left="{band.left}px"
        style:top="{band.top}px"
        style:width="{band.width}px"
        style:height="{band.height}px"
      ></div>
    {/if}
    {#if hoverIdx !== null}
      <div
        transition:fade={{ duration: reducedMotion ? 0 : 90 }}
        class={[
          'pointer-events-none absolute z-5 flex min-w-44 -translate-y-1/2 flex-col gap-0.5 rounded-ui border border-line-strong',
          'bg-surface p-1.5 text-sm whitespace-nowrap text-ink-2 shadow-lg',
          tip.flip ? '-translate-x-[calc(100%+16px)]' : 'translate-x-4',
        ]}
        style:left="{tip.left}px"
        style:top="{tip.top}px"
      >
        <div class="px-1.5 pt-0.5 pb-1 text-xs font-semibold text-ink">
          {labels[hoverIdx]}{#if shadeLast && hoverIdx === n - 1}<span class="ml-1 font-normal text-muted">in progress</span>{/if}
        </div>
        {#each tipOrder as i (series[i].label)}
          {@const s = series[i]}
          <div
            class={[
              'grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-[3px] px-1.5 py-0.5',
              focusIdx === i && 'bg-surface-2 font-semibold text-ink',
              focusIdx !== null && focusIdx !== i && 'opacity-60',
            ]}
          >
            {@render swatch(s)}
            <span>{s.label}</span>
            <span class="pl-3 text-right font-semibold text-ink tabular-nums">{fmt(s.values[hoverIdx])}</span>
          </div>
        {/each}
        {#if showTotal}
          <div class="mt-0.5 grid grid-cols-[1fr_auto] gap-2 border-t border-line px-1.5 pt-1.5 pb-0.5 text-xs">
            <span>Total</span>
            <span class="text-right font-semibold text-ink tabular-nums"
              >{fmt(stackedIdx.reduce((sum, i) => sum + (series[i].values[hoverIdx!] ?? 0), 0))}</span
            >
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
