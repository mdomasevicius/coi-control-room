<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * Hover / keyboard-focus / tap tooltip. The trigger snippet receives the tooltip's id; put it on the
   * focusable trigger as `aria-describedby` so screen readers announce the text too.
   */
  let {
    trigger,
    children,
    align = 'center',
  }: {
    trigger: Snippet<[id: string]>
    children: Snippet
    /** Which edge of the trigger the bubble lines up with; use `end` near the right edge of the screen. */
    align?: 'start' | 'center' | 'end'
  } = $props()

  const id = $props.id()

  const ALIGN = {
    start: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0',
  } as const
</script>

<span class="group/tip relative inline-flex">
  {@render trigger(id)}
  <span
    {id}
    role="tooltip"
    class={[
      'pointer-events-none absolute top-[calc(100%+0.5rem)] z-20 w-max max-w-64 rounded-ui border border-line-strong',
      'bg-surface px-3 py-2 text-left text-[0.8rem] leading-snug font-normal whitespace-normal text-ink-2 shadow-lg',
      'invisible opacity-0 transition-opacity duration-100 motion-reduce:transition-none',
      'group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100',
      ALIGN[align],
    ]}
  >
    {@render children()}
  </span>
</span>
