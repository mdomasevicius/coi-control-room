<script lang="ts">
  import type { Snippet } from 'svelte'

  /** Page title (condensed, the one large type moment), optional one-line description, controls on the right. */
  let {
    title,
    description,
    leading,
    actions,
  }: { title: string; description?: string; leading?: Snippet; actions?: Snippet } = $props()
</script>

<div class="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
  <div class="flex min-w-0 items-center gap-3">
    {@render leading?.()}
    <div class="min-w-0">
      <h1 class="text-xl font-semibold tracking-tight font-stretch-75%">{title}</h1>
      {#if description}<p class="mt-0.5 max-w-[70ch] text-sm text-ink-2">{description}</p>{/if}
    </div>
  </div>
  {#if actions}<div class="ml-auto flex max-w-full min-w-0 flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</div>
