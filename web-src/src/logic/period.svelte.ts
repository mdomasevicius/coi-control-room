import { PERIODS } from '@/lib/analysis'
import { load, save } from '@/lib/storage'
import type { FlowPeriod } from '@/logic/api/types'

const KEY = 'control-room:period'

/**
 * The period every page shows (last month, this month, this year, last year, lifetime): one app-wide choice in the
 * top bar, persisted, instead of a switch per page. Charts follow it too (see lib/historyWindow, lib/modWindow).
 */
class GlobalPeriod {
  value = $state<FlowPeriod>(PERIODS.some(([p]) => p === load<FlowPeriod>(KEY, 'lastMonth')) ? load<FlowPeriod>(KEY, 'lastMonth') : 'lastMonth')

  set(period: FlowPeriod) {
    this.value = period
    save(KEY, period)
  }

  /** "last month", for notes next to panel titles. */
  get label() {
    return PERIODS.find(([p]) => p === this.value)![1].toLowerCase()
  }
}

export const globalPeriod = new GlobalPeriod()
