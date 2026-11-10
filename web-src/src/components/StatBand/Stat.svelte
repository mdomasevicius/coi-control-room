<script lang="ts">
  import type { Snippet } from 'svelte'

  /** One reading in a StatBand: label, big condensed figure, one line of context. */
  let {
    label,
    value,
    sub,
    icon,
    href,
    valueClass = '',
  }: {
    label: string
    value: string
    sub?: Snippet | string
    /** Leading mark next to the label (product icon, series swatch). */
    icon?: Snippet
    href?: string
    /** e.g. text-neg for a negative net. Status colors only with an icon or label nearby. */
    valueClass?: string
  } = $props()
</script>

<svelte:element
  this={href ? 'a' : 'div'}
  {href}
  class={['flex min-w-0 flex-col gap-1 bg-surface px-4 py-3', href && 'transition-colors hover:bg-surface-2']}
>
  <span class="flex items-center gap-1.5 text-xs text-ink-2">
    {@render icon?.()}
    <span class="truncate">{label}</span>
  </span>
  <span class={['text-xl font-semibold font-stretch-75% tabular-nums', valueClass]}>{value}</span>
  {#if sub}
    <span class="text-2xs text-muted">
      {#if typeof sub === 'string'}{sub}{:else}{@render sub()}{/if}
    </span>
  {/if}
</svelte:element>
