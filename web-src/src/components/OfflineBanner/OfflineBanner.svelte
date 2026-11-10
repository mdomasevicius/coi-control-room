<script lang="ts">
  import OctagonAlert from '@lucide/svelte/icons/octagon-alert'
  import Button from '@/components/Button/Button.svelte'
  import { getClock } from '@/lib/live/context'

  const clock = getClock()
  let now = $state(Date.now())

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(t)
  })

  const since = $derived(clock.lastOkAt ? Math.round((now - clock.lastOkAt) / 1000) : null)
  const sinceText = $derived(
    since === null ? '' : since < 60 ? `${since} s` : since < 3600 ? `${Math.floor(since / 60)} min` : `${Math.floor(since / 3600)} h`,
  )
</script>

<!-- Critical, but calm: a surface band with a critical edge and icon, not a full-color alarm. -->
{#if clock.error}
  <div class="border-b border-l-4 border-b-line border-l-critical bg-surface" role="status">
    <div class="mx-auto flex w-full max-w-[110rem] items-start gap-3 px-4 py-3 sm:px-6">
      <OctagonAlert size={20} class="mt-0.5 shrink-0 text-critical" aria-hidden="true" />
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <p class="text-sm">
          <strong class="font-semibold">Can't reach the game.</strong>
          {#if since !== null}<span class="text-ink-2">The numbers below are from {sinceText} ago.</span>{/if}
        </p>
        <p class="text-sm text-ink-2">
          Start Captain of Industry and load a save. If it is already running, open the game console and run
          <code class="rounded-[3px] bg-surface-2 px-1 font-mono text-xs text-ink">web_api_start</code>.
        </p>
        <p class="text-2xs text-muted">
          Trying again every {clock.intervalMs / 1000} s. Last error: {clock.error}
        </p>
      </div>
      <Button size="sm" onclick={clock.refresh}>Try now</Button>
    </div>
  </div>
{/if}
