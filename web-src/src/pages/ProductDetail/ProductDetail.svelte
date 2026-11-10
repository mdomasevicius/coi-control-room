<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import ChartSpline from '@lucide/svelte/icons/chart-spline'
  import { KIND_LABELS } from '@/lib/analysis'
  import Icon from '@/components/Icon/Icon.svelte'
  import PageHeader from '@/components/PageHeader/PageHeader.svelte'
  import PinButton from '@/components/PinButton/PinButton.svelte'
  import { getGameData } from '@/lib/live/context'
  import { href } from '@/lib/router.svelte'
  import ProductFigures from './ProductFigures.svelte'
  import HistoryPanel from './HistoryPanel.svelte'
  import SourcesPanel from './SourcesPanel.svelte'
  import FlowsPanel from './FlowsPanel.svelte'

  let { id }: { id: string } = $props()

  const data = getGameData()
  const product = $derived(data.byId.get(id))
  const name = $derived(product?.name ?? id)
  const description = $derived(`${product ? (KIND_LABELS[product.kind] ?? product.kind) : 'Not unlocked'}, game id ${id}`)
</script>

<a
  class="mb-3 inline-flex items-center gap-1 rounded-ui text-sm text-ink-2 transition-colors duration-100 hover:text-ink"
  href={href.products}
>
  <ArrowLeft size={15} aria-hidden="true" />
  Products
</a>

<PageHeader title={name} {description}>
  {#snippet leading()}<Icon {id} size={44} />{/snippet}
  {#snippet actions()}
    <a
      class="inline-flex h-8 items-center gap-1.5 rounded-ui px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      href={href.compare([id])}
      title="Overlay this product with others"
    >
      <ChartSpline size={16} aria-hidden="true" />Compare with…
    </a>
    <PinButton {id} {name} />
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-4">
  <ProductFigures {id} s={data.stats[id] ?? {}} />
  <HistoryPanel {id} {name} />
  <SourcesPanel {id} />
  <FlowsPanel {id} />
</div>
