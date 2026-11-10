<script lang="ts">
  import { isByproduct } from '@/lib/byproducts'
  import { formatNumber } from '@/lib/format'

  let {
    stored,
    capacity,
    width = '6rem',
    showLabel = true,
    productId,
  }: { stored?: number; capacity?: number; width?: string; showLabel?: boolean; productId?: string } = $props()
  const ratio = $derived(capacity ? Math.min(1, (stored ?? 0) / capacity) : null)

  // Full storage is routine in COI; an emptying one is what deserves a look. Neutral from 40% up, then the
  // fill warms continuously toward the critical red as it approaches 0%.
  const WARM_FROM = 0.4
  // Byproducts (waste, slag, …) are better off empty: no warning for them.
  const warmth = $derived(
    ratio === null || (productId && isByproduct(productId)) ? 0 : Math.max(0, (WARM_FROM - ratio) / WARM_FROM),
  )
  const fill = $derived(
    warmth === 0 ? 'var(--text-2)' : `color-mix(in oklab, var(--critical) ${Math.round(warmth * 100)}%, var(--text-2))`,
  )
</script>

{#if ratio === null}
  <span class="text-muted">–</span>
{:else}
  <div class="flex items-center gap-2" title="{formatNumber(stored)} / {formatNumber(capacity)} stored">
    <div class="h-2 overflow-hidden rounded-full bg-line" style:width>
      <div
        class="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
        style:width="{Math.max(ratio * 100, ratio > 0 ? 3 : 0)}%"
        style:background={fill}
      ></div>
    </div>
    {#if showLabel}
      <span class="min-w-[3ch] text-right text-2xs text-muted tabular-nums">{Math.round(ratio * 100)}%</span>
    {/if}
  </div>
{/if}
