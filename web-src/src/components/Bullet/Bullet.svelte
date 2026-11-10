<script lang="ts">
  // A bullet bar (Stephen Few's bullet graph, reduced): the value as a bar on a track that is the whole scale, an
  // optional marker (a threshold or target) as a thin tick, and the scale's top labelled at the end, so the reader
  // sees the value against the range without reading a sentence. Status shows in the bar color only together with
  // an icon or word next to it (the caller's job).
  let {
    value,
    max,
    marker,
    critical = false,
    endLabel,
    label,
  }: {
    value: number
    max: number
    /** A threshold or target on the same scale, drawn as a tick. */
    marker?: number
    /** Bar in the critical status color (pair it with an icon or word). */
    critical?: boolean
    /** The scale's top, e.g. "3.7 GW". */
    endLabel?: string
    /** Accessible description, e.g. "2 GW used of 3.7 GW". */
    label: string
  } = $props()

  const share = (v: number) => (max > 0 ? Math.min(1, Math.max(0, v / max)) : 0)
</script>

<div class="flex items-center gap-2" role="img" aria-label={label}>
  <div class="relative h-2 flex-1 rounded-full bg-surface-2">
    <div
      class={['absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 motion-reduce:transition-none', critical ? 'bg-critical' : 'bg-ink-2']}
      style:width="{share(value) * 100}%"
    ></div>
    {#if marker !== undefined}
      <div class="absolute -inset-y-1 w-0.5 rounded-full bg-ink" style:left="calc({share(marker) * 100}% - 1px)"></div>
    {/if}
  </div>
  {#if endLabel}<span class="text-2xs text-muted tabular-nums">{endLabel}</span>{/if}
</div>
