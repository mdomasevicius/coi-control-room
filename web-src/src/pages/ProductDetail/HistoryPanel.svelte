<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import { applyWindow, historyWindow, periodLabels, windowKey } from '@/lib/historyWindow'
  import { api } from '@/logic/api/client'
  import Chart from '@/components/Chart/Chart.svelte'
  import Panel from '@/components/Panel/Panel.svelte'
  import { getClock } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'

  let { id, name }: { id: string; name: string } = $props()

  const clock = getClock()

  // Follows the app-wide period like every other chart (lib/historyWindow): the last 12 months, this or last year's
  // months, or every year for lifetime.
  const win = $derived(historyWindow(globalPeriod.value, clock.info?.date))
  const history = new LiveResource(
    clock,
    () => ({ id, key: windowKey(win) }),
    async (p, signal) =>
      applyWindow(
        await api.history({ ids: [p.id], resolution: win.resolution, count: win.count, series: ['produced', 'consumed', 'quantity'] }, signal),
        win,
      ),
  )

  const chart = $derived.by(() => {
    const h = history.data
    if (!h || history.dataParams?.id !== id) return null
    return { labels: periodLabels(h), values: h.products[id] ?? {} }
  })
</script>

<Panel title="History" note={win.title}>
  {#if chart}
    <div class="grid gap-8">
      <div class="flex min-w-0 flex-col gap-2">
          <h3 class="text-sm font-medium text-ink-2">Flow</h3>
          <Chart
            ariaLabel="{name}: produced and consumed per period"
            labels={chart.labels}
            lastInProgress={win.inProgress}
            series={[
              { label: 'Produced', values: chart.values.produced ?? [], color: '--series-produced' },
              { label: 'Consumed', values: chart.values.consumed ?? [], color: '--series-consumed' },
            ]}
          />
      </div>
      <div class="flex min-w-0 flex-col gap-2">
        <h3 class="text-sm font-medium text-ink-2" title="At the end of each period">Stock</h3>
        <Chart
          ariaLabel="{name}: stock level per period"
          labels={chart.labels}
          lastInProgress={win.inProgress}
          series={[{ label: 'Quantity', values: chart.values.quantity ?? [], color: '--series-stock' }]}
        />
      </div>
    </div>
  {:else}
    <p class="text-sm text-muted">{history.error ?? 'Loading…'}</p>
  {/if}
</Panel>
