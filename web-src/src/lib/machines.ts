// The factory seen per machine type: `sources` lists, per product, which recipe on which machine type (or which
// entity type) produced or consumed it. Inverting that gives each machine type's recipes with their inputs and
// outputs in the period. Rows are per type, never per building (the API has no per-building data).
import type { SourcesResponse } from '@/logic/api/types'

export interface Flow {
  product: string
  quantity: number
}

export interface MachineJob {
  /** Recipe id, or null for entity rows (excavators, farms, …), which have no recipe. */
  recipe: string | null
  /** Recipe display name ("A + B → C"), '' for entity rows. */
  recipeName: string
  inputs: Flow[]
  outputs: Flow[]
  consumed: number
  produced: number
}

export interface Machine {
  id: string
  name: string
  kind: 'recipe' | 'entity'
  jobs: MachineJob[]
  consumed: number
  produced: number
  /** Inputs plus outputs, for ordering. */
  throughput: number
}

const sum = (flows: Flow[]) => flows.reduce((a, f) => a + f.quantity, 0)
const byQuantity = (a: Flow, b: Flow) => b.quantity - a.quantity

/** Machine types with their recipes (or their entity flows), busiest first. Zero rows are dropped. */
export function machinesFrom(src: SourcesResponse | null): Machine[] {
  if (!src) return []
  const machines = new Map<string, { kind: Machine['kind']; jobs: Map<string, { inputs: Flow[]; outputs: Flow[] }> }>()
  for (const [product, sides] of Object.entries(src.products)) {
    for (const side of ['consumed', 'produced'] as const) {
      for (const row of sides[side].rows) {
        if (row.quantity <= 0) continue
        let machine: string, job: string, kind: Machine['kind']
        if (row.type === 'recipe' && 'recipe' in row) [machine, job, kind] = [row.machine, row.recipe, 'recipe']
        else if (row.type === 'entity' && 'entity' in row) [machine, job, kind] = [row.entity, '', 'entity']
        else continue
        const m = machines.get(machine) ?? { kind, jobs: new Map() }
        machines.set(machine, m)
        const j = m.jobs.get(job) ?? { inputs: [], outputs: [] }
        m.jobs.set(job, j)
        ;(side === 'consumed' ? j.inputs : j.outputs).push({ product, quantity: row.quantity })
      }
    }
  }
  return [...machines]
    .map(([id, m]) => {
      const jobs: MachineJob[] = [...m.jobs].map(([recipe, j]) => {
        j.inputs.sort(byQuantity)
        j.outputs.sort(byQuantity)
        return {
          recipe: recipe || null,
          recipeName: recipe ? (src.names[recipe] ?? recipe) : '',
          inputs: j.inputs,
          outputs: j.outputs,
          consumed: sum(j.inputs),
          produced: sum(j.outputs),
        }
      })
      jobs.sort((a, b) => b.consumed + b.produced - (a.consumed + a.produced))
      const consumed = jobs.reduce((a, j) => a + j.consumed, 0)
      const produced = jobs.reduce((a, j) => a + j.produced, 0)
      return { id, name: src.names[id] ?? id, kind: m.kind, jobs, consumed, produced, throughput: consumed + produced }
    })
    .sort((a, b) => b.throughput - a.throughput || a.name.localeCompare(b.name))
}
