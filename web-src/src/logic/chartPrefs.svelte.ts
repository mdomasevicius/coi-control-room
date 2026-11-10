import { load, save } from '@/lib/storage'

export type ChartKind = 'line' | 'bar'
/** Y scale: linear, log (asinh, so zero months still plot) or square root (gentler compression). */
export type ChartScale = 'linear' | 'log' | 'sqrt'

const KEY = 'control-room:chart-kind'
const SCALE_KEY = 'control-room:chart-scale'
const SCALES: ChartScale[] = ['linear', 'log', 'sqrt']

/** Line or bar and the y scale, for every chart in the app; switching on any chart switches all of them. Persisted. */
class ChartPrefs {
  kind = $state<ChartKind>(load<ChartKind>(KEY, 'line') === 'bar' ? 'bar' : 'line')

  scale = $state<ChartScale>(SCALES.includes(load<ChartScale>(SCALE_KEY, 'linear')) ? load<ChartScale>(SCALE_KEY, 'linear') : 'linear')

  set(kind: ChartKind) {
    this.kind = kind
    save(KEY, kind)
  }

  setScale(scale: ChartScale) {
    this.scale = scale
    save(SCALE_KEY, scale)
  }
}

export const chartPrefs = new ChartPrefs()
