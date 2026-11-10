<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import Button from '@/components/Button/Button.svelte'
  import { READ_ONLY } from '@/logic/readOnly'

  let { open = $bindable(false), onPalette }: { open: boolean; onPalette?: () => void } = $props()
  let dialog: HTMLDialogElement

  $effect(() => {
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  })

  const GAME_SHORTCUTS: [string[], string][] = [
    [['Space'], 'Pause or resume the game'],
    [['1'], 'Game speed 1×'],
    [['2'], 'Game speed 2×'],
    [['3'], 'Game speed 3×'],
    [['4'], 'Faster game speed, when the game offers one'],
  ]
  const SHORTCUTS: [string[], string][] = [
    ...(READ_ONLY ? [] : GAME_SHORTCUTS),
    [['Ctrl', 'K'], 'Command palette'],
    [['/'], 'Search products'],
    [['o'], 'Go to Overview'],
    [['p'], 'Go to Products'],
    [['m'], 'Go to Factory'],
    [['f'], 'Go to Food & farms'],
    [['s'], 'Go to Settlements'],
    [['u'], 'Go to Unity'],
    [['e'], 'Go to Electricity'],
    [['k'], 'Go to Computing'],
    [['c'], 'Go to Console'],
    [['?'], 'Show this help'],
    [['Esc'], 'Close this dialog or clear the search'],
  ]
</script>

<dialog
  class="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-ui border border-line-strong bg-surface text-ink shadow-lg backdrop:bg-scrim"
  aria-labelledby="shortcut-help-title"
  bind:this={dialog}
  onclose={() => (open = false)}
  onclick={(e) => e.target === dialog && dialog.close()}
>
  <header class="flex items-center gap-3 border-b border-line py-2 pr-2 pl-5">
    <h2 id="shortcut-help-title" class="text-sm font-semibold">Keyboard shortcuts</h2>
    <Button variant="ghost" size="icon-sm" class="ml-auto" aria-label="Close" onclick={() => dialog.close()}>
      <X size={16} aria-hidden="true" />
    </Button>
  </header>
  <dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 px-5 py-4 text-sm">
    {#each SHORTCUTS as [keys, label] (label)}
      <dt class="flex gap-1">{#each keys as k (k)}<kbd>{k}</kbd>{/each}</dt>
      <dd class="text-ink-2">{label}</dd>
    {/each}
  </dl>
  <footer class="flex justify-end gap-2 border-t border-line px-5 py-3">
    {#if onPalette}<Button variant="ghost" onclick={onPalette}>Open command palette</Button>{/if}
    <Button onclick={() => dialog.close()}>Close</Button>
  </footer>
</dialog>
