<script lang="ts">
  import { globalPeriod } from '@/logic/period.svelte'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import { api } from '@/logic/api/client'
  import Icon from '@/components/Icon/Icon.svelte'
  import StatBand from '@/components/StatBand/StatBand.svelte'
  import Stat from '@/components/StatBand/Stat.svelte'
  import { formatNumber } from '@/lib/format'
  import { getClock, getGameData } from '@/lib/live/context'
  import { LiveResource } from '@/lib/live/resource.svelte'
  import { machinesFrom, type Flow } from '@/lib/machines'
  import { href } from '@/lib/router.svelte'

  // What the factory is doing: `sources` inverted into machine types, each with its recipes and what they consumed
  // and produced in the period.
  const clock = getClock()
  const data = getGameData()

  const period = $derived(globalPeriod.value)

  const sources = new LiveResource(clock, () => period, (p, signal) => api.sources({ period: p }, signal))

  const machines = $derived(machinesFrom(sources.data))
  const name = (id: string) => data.byId.get(id)?.name ?? sources.data?.names[id] ?? id

  const recipeCount = $derived(machines.reduce((a, m) => a + m.jobs.filter((j) => j.recipe).length, 0))
  const recipeMachines = $derived(machines.filter((m) => m.kind === 'recipe').length)

  // The product machines put out the most of, summed over every machine type.
  const biggest = $derived.by(() => {
    const totals = new Map<string, number>()
    for (const m of machines) for (const j of m.jobs) for (const f of j.outputs) totals.set(f.product, (totals.get(f.product) ?? 0) + f.quantity)
    let best: Flow | null = null
    for (const [product, quantity] of totals) if (!best || quantity > best.quantity) best = { product, quantity }
    return best
  })
  const busiest = $derived(machines[0] ?? null)
</script>

{#snippet flows(list: Flow[], tone: 'text-neg' | 'text-pos', verb: string)}
  {#each list as f (f.product)}
    <a
      class="inline-flex items-center gap-1 rounded-ui py-0.5 pr-1.5 hover:bg-surface-2"
      href={href.product(f.product)}
      title="{name(f.product)}: {formatNumber(f.quantity)} {verb}"
    >
      <Icon id={f.product} size={24} />
      <span class={['text-sm font-semibold tabular-nums', tone]}>{formatNumber(f.quantity)}</span>
    </a>
  {/each}
{/snippet}

{#snippet total(label: string, value: number, tone: 'text-neg' | 'text-pos')}
  <div class="flex flex-col items-end">
    <span class="text-2xs text-muted">{label}</span>
    <span class={['text-sm font-semibold tabular-nums', tone]}>{formatNumber(value)}</span>
  </div>
{/snippet}

<div class="flex flex-col gap-4">

  {#if !sources.data}
    <p class="text-sm text-muted">{sources.error ?? 'Loading…'}</p>
  {:else}
    <StatBand>
      <Stat label="Machine types" value={String(machines.length)} sub="{recipeMachines} with recipes, {machines.length - recipeMachines} without" />
      <Stat label="Recipes" value={String(recipeCount)} />
      <Stat
        label="Biggest output"
        value={biggest ? formatNumber(biggest.quantity) : '–'}
        sub={biggest ? name(biggest.product) : 'Nothing produced'}
        href={biggest ? href.product(biggest.product) : undefined}
      >
        {#snippet icon()}{#if biggest}<Icon id={biggest.product} size={18} />{/if}{/snippet}
      </Stat>
      <Stat
        label="Busiest machine"
        value={busiest ? formatNumber(busiest.throughput) : '–'}
        sub={busiest ? busiest.name : 'Nothing running'}
      >
        {#snippet icon()}{#if busiest}<Icon id={busiest.id} size={18} />{/if}{/snippet}
      </Stat>
    </StatBand>

    {#if machines.length === 0}
      <p class="text-sm text-muted">No machine ran in this period.</p>
    {:else}
      <div class="grid items-start gap-4 xl:grid-cols-2">
        {#each machines as m (m.id)}
          <section class="min-w-0 rounded-ui border border-line bg-surface">
            <header class="flex items-center gap-3 border-b border-line px-4 py-3">
              <Icon id={m.id} size={40} />
              <div class="flex min-w-0 flex-1 flex-col">
                <h2 class="truncate text-sm font-semibold">{m.name}</h2>
                <span class="text-2xs text-muted">
                  {#if m.kind === 'recipe'}{m.jobs.length} {m.jobs.length === 1 ? 'recipe' : 'recipes'}{:else}No recipes{/if}
                </span>
              </div>
              {#if m.consumed}{@render total('Consumed', m.consumed, 'text-neg')}{/if}
              {#if m.produced}{@render total('Produced', m.produced, 'text-pos')}{/if}
            </header>
            <ul class="flex flex-col">
              {#each m.jobs as j (j.recipe ?? '')}
                <li class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-4 py-2.5 last:border-b-0" title={j.recipeName || undefined}>
                  {#if j.inputs.length}
                    <span class="flex flex-wrap items-center gap-x-1" aria-label="Consumed">{@render flows(j.inputs, 'text-neg', 'consumed')}</span>
                  {/if}
                  {#if j.inputs.length && j.outputs.length}<ArrowRight size={16} class="text-muted" aria-hidden="true" />{/if}
                  {#if j.outputs.length}
                    <span class="flex flex-wrap items-center gap-x-1" aria-label="Produced">{@render flows(j.outputs, 'text-pos', 'produced')}</span>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    {/if}
  {/if}
</div>
