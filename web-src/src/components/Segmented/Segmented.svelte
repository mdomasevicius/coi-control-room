<script lang="ts" module>
  import type { Component } from 'svelte'

  export interface SegmentOption<V> {
    value: V
    label: string
    /** Lucide (or any) icon component; with `iconOnly` the label becomes the accessible name and tooltip. */
    icon?: Component<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>
    title?: string
    /** Shown muted after the label, e.g. how many items the option selects. */
    count?: number
  }
</script>

<script lang="ts" generics="T extends string | number">

  let {
    options,
    value,
    onchange,
    label,
    size = 'md',
    iconOnly = false,
    disabled = false,
    collapse = false,
    class: className = '',
  }: {
    options: readonly SegmentOption<T>[]
    value: T | null
    onchange: (value: T) => void
    /** Accessible name of the group. */
    label: string
    size?: 'sm' | 'md'
    iconOnly?: boolean
    disabled?: boolean
    /** Below the sm breakpoint, render a native select instead (for groups too wide for a phone). */
    collapse?: boolean
    class?: string
  } = $props()
</script>

{#if collapse}
  <select
    class={['sm:hidden', size === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm', className]}
    aria-label={label}
    {disabled}
    onchange={(e) => onchange(options[e.currentTarget.selectedIndex].value)}
  >
    {#each options as o (o.value)}
      <option selected={o.value === value}>{o.label}{o.count !== undefined ? ` (${o.count})` : ''}</option>
    {/each}
  </select>
{/if}

<!-- Selected = inverted ink/surface: the design reserves hue for data and states. -->
<div
  class={[
    collapse && 'max-sm:hidden',
    // Never wider than its container: a long group scrolls sideways on phones instead of overflowing.
    'inline-flex max-w-full shrink-0 items-stretch overflow-x-auto rounded-ui border border-line-strong bg-surface p-0.5',
    size === 'sm' ? 'h-7' : 'h-8',
    className,
  ]}
  role="group"
  aria-label={label}
>
  {#each options as o (o.value)}
    {@const Icon = o.icon}
    <button
      type="button"
      class={[
        'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[3px] font-medium whitespace-nowrap',
        'text-ink-2 transition-colors duration-100 hover:enabled:text-ink motion-reduce:transition-none',
        'disabled:cursor-default disabled:opacity-50',
        'aria-pressed:bg-sel aria-pressed:text-sel-ink',
        size === 'sm' ? 'text-2xs' : 'text-xs',
        iconOnly ? 'aspect-square' : size === 'sm' ? 'px-2' : 'px-2.5',
      ]}
      aria-pressed={o.value === value}
      aria-label={iconOnly ? o.label : undefined}
      title={o.title ?? (iconOnly ? o.label : undefined)}
      {disabled}
      onclick={() => onchange(o.value)}
    >
      {#if Icon}<Icon size={size === 'sm' ? 14 : 15} strokeWidth={2} aria-hidden="true" />{/if}
      {#if !iconOnly}{o.label}{/if}
      {#if o.count !== undefined}<span class="font-normal tabular-nums opacity-70">{o.count}</span>{/if}
    </button>
  {/each}
</div>
