<script lang="ts">
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import Icon from '@/components/Icon/Icon.svelte'
  import { getGameData } from '@/lib/live/context'

  /**
   * A recipe drawn as product icons: inputs → outputs. The API only gives the recipe's display name
   * ("Iron + Wood + Concrete slab → Construction Parts"); product names are unique, so each name maps back to its
   * product id. A name that doesn't map (locked product, odd naming) falls back to its text.
   */
  let { recipe, highlight, size = 20 }: { recipe: string; highlight?: string; size?: number } = $props()

  const data = getGameData()
  const idByName = $derived(new Map(data.products.map((p) => [p.name, p.id])))

  const sides = $derived(
    recipe.split(' → ').map((side) =>
      side
        .split(' + ')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ name, id: idByName.get(name) })),
    ),
  )
</script>

<span class="inline-flex flex-wrap items-center gap-1" aria-label={recipe} role="img">
  {#each sides as side, i (i)}
    {#if i > 0}<ArrowRight size={14} class="mx-0.5 text-muted" aria-hidden="true" />{/if}
    {#each side as item (item.name)}
      {#if item.id}
        <span
          class={['inline-grid place-items-center rounded-ui', item.id === highlight && 'bg-surface-2 ring-1 ring-line-strong']}
          title={item.name}
        >
          <Icon id={item.id} {size} />
        </span>
      {:else}
        <span class="text-2xs text-muted">{item.name}</span>
      {/if}
    {/each}
  {/each}
</span>
