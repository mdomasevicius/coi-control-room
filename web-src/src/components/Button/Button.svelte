<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  type Variant = 'default' | 'ghost' | 'signal' | 'selected'
  type Size = 'sm' | 'md' | 'icon' | 'icon-sm'

  let {
    variant = 'default',
    size = 'md',
    class: className = '',
    type = 'button',
    children,
    ...rest
  }: HTMLButtonAttributes & { variant?: Variant; size?: Size; class?: string; children?: Snippet } = $props()

  const VARIANT: Record<Variant, string> = {
    default: 'border border-line-strong bg-surface text-ink hover:enabled:bg-surface-2',
    ghost: 'text-ink-2 hover:enabled:bg-surface-2 hover:enabled:text-ink',
    // Paused / hazard state only.
    signal: 'bg-signal text-signal-ink hover:enabled:brightness-95',
    // A toggled-on mode (inverted ink/surface, like a pressed segment).
    selected: 'bg-sel text-sel-ink hover:enabled:opacity-90',
  }
  const SIZE: Record<Size, string> = {
    sm: 'h-7 gap-1 px-2 text-xs',
    md: 'h-8 gap-1.5 px-3 text-sm',
    icon: 'size-8',
    'icon-sm': 'size-7',
  }
</script>

<button
  {type}
  class={[
    'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-ui font-medium whitespace-nowrap',
    'transition-colors duration-100 disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none',
    VARIANT[variant],
    SIZE[size],
    className,
  ]}
  {...rest}
>
  {@render children?.()}
</button>
