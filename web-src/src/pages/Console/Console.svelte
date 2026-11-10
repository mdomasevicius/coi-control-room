<script lang="ts">
  import PageHeader from '@/components/PageHeader/PageHeader.svelte'
  import Screenshot from '@/components/Screenshot/Screenshot.svelte'
  import Terminal from './Terminal.svelte'
  import InputCommands from './InputCommands.svelte'
  import { READ_ONLY } from '@/logic/readOnly'
</script>

<PageHeader title={READ_ONLY ? 'Camera' : 'Console'} />

{#if READ_ONLY}
  <!-- Read-only: the camera only (screenshots are a read route). -->
  <Screenshot />
{:else}
<div class="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
  <Terminal />
  <div class="lg:sticky lg:top-16">
    <Screenshot />
  </div>
  <div class="lg:col-span-2">
    <InputCommands />
  </div>
</div>
{/if}
