import { FLOW_INDEX, type Flow, type FlowPeriod, type ProductStats } from '@/logic/api/types'

export const flowAt = (f: Flow | undefined, period: FlowPeriod): number | null => (f ? f[FLOW_INDEX[period]] : null)

export function net(s: ProductStats, period: FlowPeriod): number | null {
  const p = flowAt(s.produced, period)
  const c = flowAt(s.consumed, period)
  return p === null || c === null ? null : p - c
}

/** stored / storageCapacity in 0..1, or null when there is no storage. */
export function fill(s: ProductStats): number | null {
  if (!s.storageCapacity) return null
  return Math.min(1, (s.stored ?? 0) / s.storageCapacity)
}

/**
 * Months until the stock runs out at last month's net rate (the last finished month, so it doesn't
 * jitter during the month). null when the stock isn't shrinking.
 */
export function monthsLeft(s: ProductStats): number | null {
  const n = net(s, 'lastMonth')
  if (n === null || n >= 0) return null
  return (s.quantity ?? 0) / -n
}

export const KIND_LABELS: Record<string, string> = {
  countable: 'Unit',
  loose: 'Loose',
  fluid: 'Fluid',
  molten: 'Molten',
  virtual: 'Virtual',
}

export const PERIODS: [FlowPeriod, string][] = [
  ['lastMonth', 'Last month'],
  ['thisMonth', 'This month'],
  ['thisYear', 'This year'],
  ['lastYear', 'Last year'],
  ['lifetime', 'Lifetime'],
]
