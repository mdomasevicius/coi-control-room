<script lang="ts">
  import Download from '@lucide/svelte/icons/download'
  import Button from '@/components/Button/Button.svelte'
  import { downloadCsv, type CsvTable } from '@/lib/csv'

  // Builds the table only when clicked, so it costs nothing while data refreshes.
  let {
    name,
    table,
    label = `Download ${name} as CSV`,
    size = 'icon-sm',
    class: className = '',
  }: {
    /** File name stem, e.g. "products last month" -> coi-products-last-month.csv. */
    name: string
    table: () => CsvTable
    /** Accessible name. */
    label?: string
    size?: 'icon-sm' | 'icon'
    class?: string
  } = $props()
</script>

<Button variant="ghost" {size} class={className} aria-label={label} title="Download CSV" onclick={() => downloadCsv(name, table())}>
  <Download size={size === 'icon' ? 16 : 15} aria-hidden="true" />
</Button>
