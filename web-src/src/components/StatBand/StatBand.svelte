<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * One continuous gauge cluster split by hairlines (gap-px over the line color), instead of separate cards.
   * Children are <Stat>s.
   */
  let { children, class: className = '' }: { children: Snippet; class?: string } = $props()
</script>

<div
  class={[
    'grid grid-cols-2 gap-px overflow-hidden rounded-ui border border-line bg-line',
    'max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]',
    className,
  ]}
>
  {@render children()}
</div>
