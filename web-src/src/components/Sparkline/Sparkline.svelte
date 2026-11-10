<script lang="ts">
  import { diffAreas } from '@/lib/diffAreas'

  // Inline trend for table rows (a uPlot instance per row would be overkill). The shape is the point here, not
  // the level (the row's figures carry that), so the y-scale fits the row's own range instead of starting at 0,
  // with a floor on the span so a flat series stays flat instead of magnifying noise. All series in one sparkline
  // share that scale.
  //
  // Two series toned produced + consumed draw the gap between them as a wash: produced hue where production leads,
  // consumed hue where it trails, so a row's surplus or deficit history reads at a glance. A single series gets a
  // soft area under its line. The last point carries a dot.
  type Tone = 'produced' | 'consumed'
  let {
    series,
    width = 96,
    height = 30,
    fluid = false,
    partialLast = false,
    label = '',
  }: {
    /** `tone` picks a series token; `color` (any CSS color, e.g. a var()) is the fallback for other series. */
    series: { values: number[]; tone?: Tone; color?: string }[]
    /** Fixed width; with `fluid`, the minimum width. */
    width?: number
    height?: number
    /** Fill the container's width (e.g. a table's `grow` column), redrawn at that width so lines stay crisp. */
    fluid?: boolean
    /** The last value is a period still in progress: left out, since a part-month always looks like a drop. */
    partialLast?: boolean
    label?: string
  } = $props()

  const TONE: Record<Tone, string> = { produced: 'var(--series-produced)', consumed: 'var(--series-consumed)' }
  const colorOf = (s: (typeof series)[number]) => (s.tone ? TONE[s.tone] : (s.color ?? 'var(--text-2)'))

  /** The span is at least this share of the largest value, so ±1% wobble doesn't fill the row. */
  const MIN_SPAN = 0.25
  const PAD_Y = 4
  const PAD_X = 4
  const STROKE = 1.5

  const uid = $props.id()
  let measured = $state(0)
  const w = $derived(fluid ? Math.max(width, Math.floor(measured)) : width)

  const lines = $derived(series.map((s) => (partialLast ? s.values.slice(0, -1) : s.values)))
  const n = $derived(Math.max(0, ...lines.map((v) => v.length)))
  const domain = $derived.by(() => {
    const all = lines.flat()
    if (!all.length) return { lo: 0, hi: 1 }
    let lo = Math.min(...all)
    let hi = Math.max(...all)
    const span = Math.max(hi - lo, Math.abs(hi) * MIN_SPAN, 1)
    // Grow the range around the data, but never below 0 for series that never go negative (counts).
    const extra = span - (hi - lo)
    lo = lo >= 0 ? Math.max(0, lo - extra / 2) : lo - extra / 2
    hi = lo + span
    return { lo, hi }
  })

  const x = (i: number) => PAD_X + (n > 1 ? (i * (w - PAD_X * 2)) / (n - 1) : (w - PAD_X * 2) / 2)
  const y = (v: number) => height - PAD_Y - ((v - domain.lo) / (domain.hi - domain.lo)) * (height - PAD_Y * 2)
  const pt = (i: number, v: number) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`

  const linePath = (values: number[]) => (values.length < 2 ? '' : 'M' + values.map((v, i) => pt(i, v)).join('L'))
  const areaPath = (values: number[]) =>
    values.length < 2 ? '' : `${linePath(values)}L${x(values.length - 1).toFixed(1)},${height}L${x(0).toFixed(1)},${height}Z`

  const isFlowPair = $derived(series.length === 2 && series[0].tone === 'produced' && series[1].tone === 'consumed')
  const diff = $derived(isFlowPair ? diffAreas(lines[0], lines[1]) : [])
</script>

{#snippet chart()}
  <svg class="block overflow-visible" width={w} {height} viewBox="0 0 {w} {height}" role="img" aria-label={label}>
    <title>{label}</title>
    {#if n >= 2}
      {#if isFlowPair}
        {#each diff as a, i (i)}
          <path
            d={'M' + a.points.map(([i, v]) => pt(i, v)).join('L') + 'Z'}
            fill={a.aAbove ? TONE.produced : TONE.consumed}
            opacity="0.2"
          />
        {/each}
      {:else if series.length === 1}
        <defs>
          <linearGradient id="{uid}-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color={colorOf(series[0])} stop-opacity="0.22" />
            <stop offset="1" stop-color={colorOf(series[0])} stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath(lines[0])} fill="url(#{uid}-area)" />
      {/if}
      {#each series as s, i (i)}
        <path class="fill-none" stroke={colorOf(s)} stroke-width={STROKE} stroke-linecap="round" stroke-linejoin="round" d={linePath(lines[i])} />
      {/each}
      {#each series as s, i (i)}
        {@const last = lines[i].length - 1}
        {#if last >= 0}
          <!-- Latest value: a dot with a surface ring, so it reads where the lines meet. -->
          <circle cx={x(last)} cy={y(lines[i][last])} r="2.75" fill={colorOf(s)} stroke="var(--surface)" stroke-width="1.5" />
        {/if}
      {/each}
    {:else}
      <line x1={PAD_X} x2={w - PAD_X} y1={height / 2} y2={height / 2} stroke="var(--grid)" stroke-width="1" />
    {/if}
  </svg>
{/snippet}

{#if fluid}
  <!-- The svg sits out of flow so its own width can't hold the measured box open when the column narrows. -->
  <div class="relative w-full" style:min-width="{width}px" style:height="{height}px" bind:clientWidth={measured}>
    <div class="absolute inset-0">{@render chart()}</div>
  </div>
{:else}
  {@render chart()}
{/if}
