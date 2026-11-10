<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import { PERIODS } from '@/lib/analysis'
  import { api } from '@/logic/api/client'
  import { FLOW_SERIES } from '@/logic/api/types'
  import Panel from '@/components/Panel/Panel.svelte'
  import { FLOW_INDEX } from '@/logic/api/types'
  import { formatNumber } from '@/lib/format'
  import { getClock } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'

  let { id }: { id: string } = $props()

  const clock = getClock()

  const breakdown = new LiveResource(
    clock,
    () => id,
    async (pid, signal) => (await api.stats({ ids: [pid], series: [...FLOW_SERIES] }, signal)).products[pid] ?? {},
  )

  const SERIES_LABELS: Record<string, string> = {
    produced: 'Produced (total)',
    producedByBuildings: 'Buildings',
    producedByMining: 'Mining',
    producedByRecycling: 'Recycling',
    producedByResearch: 'Research',
    producedBySettlements: 'Settlements',
    producedByImport: 'Import',
    producedByDeconstruction: 'Deconstruction',
    consumed: 'Consumed (total)',
    consumedByConstruction: 'Construction',
    consumedByMaintenance: 'Maintenance',
    consumedBySettlements: 'Settlements',
    consumedByResearch: 'Research',
    consumedByFarms: 'Farms',
    consumedByExport: 'Export',
    consumedAsFuel: 'Fuel',
    dumped: 'Dumped',
  }

  // Phones show one period at a time (five columns don't fit).
  const period = $derived(globalPeriod.value)

  // Totals always; sub-flows only when they ever had a value.
  const rows = $derived.by(() => {
    const b = breakdown.data
    if (!b || breakdown.dataParams !== id) return []
    return FLOW_SERIES.filter((k) => k === 'produced' || k === 'consumed' || b[k]?.some((v) => v !== 0)).map((k) => ({
      key: k,
      label: SERIES_LABELS[k],
      total: k === 'produced' || k === 'consumed',
      values: b[k] ?? [0, 0, 0, 0, 0],
    }))
  })
</script>

<Panel title="All flows" flush>
  {#if rows.length}
    <div class="overflow-x-auto max-md:hidden">
      <table class="data-table">
        <thead>
          <tr>
            <th class="pl-4">Flow</th>
            {#each PERIODS as [key, label] (key)}<th class="num last:pr-4">{label}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.key)}
            <tr class="last:[&>td]:border-b-0">
              <td class={r.total ? 'pl-4 font-semibold' : 'pl-8 text-ink-2'}>{r.label}</td>
              {#each PERIODS as [key] (key)}
                <td class={['num last:pr-4', r.total && 'font-semibold']}>{formatNumber(r.values[FLOW_INDEX[key]])}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <dl class="md:hidden">
      {#each rows as r (r.key)}
        <div class="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0 {r.total ? 'px-4' : 'pr-4 pl-8'}">
          <dt class={r.total ? 'font-semibold' : 'text-ink-2'}>{r.label}</dt>
          <dd class={['tabular-nums', r.total && 'font-semibold']}>{formatNumber(r.values[FLOW_INDEX[period]])}</dd>
        </div>
      {/each}
    </dl>
  {:else}
    <p class="p-4 text-sm text-muted">{breakdown.error ?? 'Loading…'}</p>
  {/if}
</Panel>
