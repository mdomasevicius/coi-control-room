<script lang="ts">
  import Star from '@lucide/svelte/icons/star'
  import { getGameData } from '@/lib/live/context'
  import { READ_ONLY } from '@/logic/readOnly'

  let { id, name, size = 'sm' }: { id: string; name: string; size?: 'sm' | 'md' } = $props()
  const data = getGameData()
  let busy = $state(false)
  const pinned = $derived(data.pinnedSet.has(id))

  async function toggle(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    busy = true
    try {
      await data.togglePin(id)
    } finally {
      busy = false
    }
  }
</script>

<!-- Pinned is a selection, not a state: ink vs muted, no hue. Read-only: the star shows, but can't be clicked. -->
{#if READ_ONLY}
  <span
    class={['inline-grid shrink-0 place-items-center', size === 'md' ? 'size-8' : 'size-7', pinned ? 'text-ink' : 'text-muted/50']}
    title={pinned ? 'Pinned in game' : undefined}
  >
    {#if pinned}<Star size={size === 'md' ? 18 : 15} class="fill-current" aria-label="Pinned in game" />{/if}
  </span>
{:else}
<button
  type="button"
  class={[
    'inline-grid shrink-0 cursor-pointer place-items-center rounded-ui transition-colors duration-100',
    'hover:enabled:bg-surface-2 hover:enabled:text-ink disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none',
    size === 'md' ? 'size-8' : 'size-7',
    pinned ? 'text-ink' : 'text-muted',
  ]}
  disabled={busy}
  onclick={toggle}
  aria-pressed={pinned}
  aria-label="{pinned ? 'Unpin' : 'Pin'} {name} in game"
  title="{pinned ? 'Unpin' : 'Pin'} in game"
>
  <Star size={size === 'md' ? 18 : 15} class={pinned ? 'fill-current' : ''} aria-hidden="true" />
</button>
{/if}
