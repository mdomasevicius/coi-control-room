<script lang="ts">
  import { api } from '@/logic/api/client'
  import { getClock } from '@/lib/live/context'

  // Game icon for a product / machine / building / vehicle id, served by the game itself.
  let { id, size = 24 }: { id: string; size?: number } = $props()
  const clock = getClock()
  let failed = $state(false)
</script>

{#if failed}
  <span class="inline-block flex-none rounded-ui bg-surface-2 align-middle" style:width="{size}px" style:height="{size}px" aria-hidden="true"></span>
{:else}
  <img
    src={api.iconUrl(id, clock.info?.sessionId ?? '')}
    class="inline-block flex-none object-contain align-middle drop-shadow-[0_0_1px_var(--icon-edge)]"
    alt=""
    width={size}
    height={size}
    loading="lazy"
    decoding="async"
    onerror={() => (failed = true)}
  />
{/if}

