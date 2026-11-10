<script lang="ts">
  import PageHeader from '@/components/PageHeader/PageHeader.svelte'
  import { href, type FactoryTab } from '@/lib/router.svelte'
  import Machines from './Machines.svelte'
  import Chain from './Chain.svelte'
  import Upkeep from './Upkeep.svelte'
  import Waste from './Waste.svelte'
  import Mining from './Mining.svelte'

  // The factory as a whole: what machines do, how products chain, and what building, upkeep, dumping, mining and
  // fuel consume or yield. One page, a tab per question; the tab is in the URL (#/factory/<tab>).
  let { tab }: { tab: FactoryTab } = $props()

  const TABS: { tab: FactoryTab; label: string }[] = [
    { tab: 'machines', label: 'Machines' },
    { tab: 'chain', label: 'Production chain' },
    { tab: 'upkeep', label: 'Construction & upkeep' },
    { tab: 'waste', label: 'Waste & dumping' },
    { tab: 'mining', label: 'Mining & fuel' },
  ]
</script>

<PageHeader title="Factory" />

<nav class="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Factory views">
  {#each TABS as t (t.tab)}
    <a
      class={[
        'relative flex h-10 shrink-0 items-center px-3 text-sm whitespace-nowrap text-ink-2 transition-colors hover:text-ink',
        'aria-[current=page]:font-semibold aria-[current=page]:text-ink',
        'after:absolute after:inset-x-3 after:-bottom-px after:h-[3px] after:bg-transparent aria-[current=page]:after:bg-ink',
      ]}
      href={href.factory(t.tab)}
      aria-current={t.tab === tab ? 'page' : undefined}>{t.label}</a
    >
  {/each}
</nav>

{#if tab === 'machines'}
  <Machines />
{:else if tab === 'chain'}
  <Chain />
{:else if tab === 'upkeep'}
  <Upkeep />
{:else if tab === 'waste'}
  <Waste />
{:else}
  <Mining />
{/if}
