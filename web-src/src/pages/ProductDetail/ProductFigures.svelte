<script lang="ts">
  import { fill, flowAt, monthsLeft, net } from '@/lib/analysis'
  import type { ProductStats } from '@/logic/api/types'
  import StatBand from '@/components/StatBand/StatBand.svelte'
  import Stat from '@/components/StatBand/Stat.svelte'
  import StorageBar from '@/components/StorageBar/StorageBar.svelte'
  import { formatNumber, formatSigned } from '@/lib/format'
  import { gameSpeed } from '@/logic/gameSpeed.svelte'

  let { s, id }: { s: ProductStats; id: string } = $props()

  const left = $derived(monthsLeft(s))
  const leftReal = $derived(left === null ? null : gameSpeed.realDurationAtSpeed(left))
  const lastNet = $derived(net(s, 'lastMonth'))
  const fillRatio = $derived(fill(s))
  const NET_CLASS = { pos: 'text-pos', neg: 'text-neg', zero: '' } as const
  const netTone = $derived(lastNet === null || lastNet === 0 ? 'zero' : lastNet > 0 ? 'pos' : 'neg')
</script>

{#snippet swatch(bg: 'bg-produced' | 'bg-consumed')}
  <span class={['h-1 w-4 flex-none rounded-full', bg]} aria-hidden="true"></span>
{/snippet}

<StatBand>
  <Stat label="Quantity" value={formatNumber(s.quantity)} sub="{formatNumber(s.stored)} in storage" />
  <Stat label="Storage" value={fillRatio === null ? '–' : `${Math.round(fillRatio * 100)}%`}>
    {#snippet sub()}<StorageBar productId={id} stored={s.stored} capacity={s.storageCapacity} width="100%" showLabel={false} />{/snippet}
  </Stat>
  <Stat
    label="Produced"
    value={formatNumber(flowAt(s.produced, 'lastMonth'))}
    sub="Last month; {formatNumber(flowAt(s.produced, 'thisMonth'))} this month"
  >
    {#snippet icon()}{@render swatch('bg-produced')}{/snippet}
  </Stat>
  <Stat
    label="Consumed"
    value={formatNumber(flowAt(s.consumed, 'lastMonth'))}
    sub="Last month; {formatNumber(flowAt(s.consumed, 'thisMonth'))} this month"
  >
    {#snippet icon()}{@render swatch('bg-consumed')}{/snippet}
  </Stat>
  <Stat
    label="Net"
    value={lastNet === null ? '–' : lastNet === 0 ? '0' : formatSigned(lastNet)}
    valueClass={NET_CLASS[netTone]}
    sub={left !== null
      ? `Lasts about ${left < 1 ? `${Math.round(left * 30)} days` : `${left.toFixed(1)} months`}${leftReal ? `, ${leftReal}` : ''}`
      : 'Last month; stock not shrinking'}
  />
</StatBand>
