<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A flat instrument bay: surface, 1px line, header row (title left, controls right). No shadow: depth comes
   * from the steel-grey surface steps, not from lifting cards off the page.
   */
  let {
    title,
    note,
    actions,
    children,
    flush = false,
    class: className = '',
  }: {
    title?: string
    /** Quiet context after the title, e.g. "last month". */
    note?: string
    actions?: Snippet
    children: Snippet
    /** No body padding: for tables and charts that run edge to edge. */
    flush?: boolean
    class?: string
  } = $props()
</script>

<section class={['min-w-0 rounded-ui border border-line bg-surface', className]}>
  {#if title || actions}
    <header class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2">
      {#if title}
        <h2 class="text-sm font-semibold">
          {title}{#if note}<span class="ml-2 font-normal text-muted">{note}</span>{/if}
        </h2>
      {/if}
      {#if actions}<div class="ml-auto flex max-w-full min-w-0 flex-wrap items-center gap-2">{@render actions()}</div>{/if}
    </header>
  {/if}
  <div class={flush ? '' : 'p-4'}>
    {@render children()}
  </div>
</section>
