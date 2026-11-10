/**
 * The area between two series, split where they cross: each polygon knows whether `a` was above `b` there.
 * Points are [index, value]; the caller maps them to pixels. Used for produced vs consumed: the gap between the
 * lines is filled in the produced hue where production leads (surplus) and the consumed hue where it trails.
 */
export interface DiffArea {
  /** true where a > b. */
  aAbove: boolean
  points: [number, number][]
}

export function diffAreas(a: (number | null)[], b: (number | null)[]): DiffArea[] {
  const n = Math.min(a.length, b.length)
  const out: DiffArea[] = []
  let top: [number, number][] = []
  let bottom: [number, number][] = []
  let sign: boolean | null = null

  const flush = () => {
    if (top.length > 1 && sign !== null) out.push({ aAbove: sign, points: [...top, ...bottom.reverse()] })
    top = []
    bottom = []
  }

  for (let i = 0; i < n; i++) {
    const ai = a[i]
    const bi = b[i]
    if (ai === null || bi === null) {
      flush()
      sign = null
      continue
    }
    const s = ai >= bi
    if (sign !== null && s !== sign && i > 0) {
      // Close the polygon at the crossing between i-1 and i.
      const ap = a[i - 1]!
      const bp = b[i - 1]!
      const t = (bp - ap) / (ai - ap - (bi - bp))
      const x = i - 1 + t
      const y = ap + (ai - ap) * t
      top.push([x, y])
      bottom.push([x, y])
      flush()
      top.push([x, y])
      bottom.push([x, y])
    }
    sign = s
    top.push([i, ai])
    bottom.push([i, bi])
  }
  flush()
  return out
}
