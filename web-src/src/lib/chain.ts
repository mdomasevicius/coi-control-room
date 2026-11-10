// The production chain as a layered flow graph: products and machine recipes (or entity types, which have no
// recipe) as nodes, `sources` rows as links (product → recipe for consumed, recipe → product for produced), link
// width by quantity. A small Sankey-style layout, written here to avoid a charting dependency.
import type { SourcesResponse } from '@/logic/api/types'

export type ChainNodeKind = 'product' | 'process'

export interface ChainNode {
  key: string
  kind: ChainNodeKind
  /** Product id, or machine / entity id for processes (the icon id). */
  id: string
  /** Recipe id for recipe processes, null for products and entity rows. */
  recipe: string | null
  layer: number
  /** Sum of incoming and of outgoing link quantities. */
  qIn: number
  qOut: number
  x: number
  y: number
  w: number
  h: number
}

export interface ChainLink {
  key: string
  source: string
  target: string
  /** The product flowing along the link. */
  product: string
  quantity: number
  /** Drawn width in px. */
  width: number
  /** Points into an earlier or the same column (a cycle, e.g. a farm collecting and using water). */
  back: boolean
  path: string
}

export interface ChainGraph {
  nodes: ChainNode[]
  links: ChainLink[]
}

export interface ChainLayout extends ChainGraph {
  width: number
  height: number
  layers: number
}

const pk = (id: string) => `p:${id}`

/** Every recipe and entity row of `sources` as a graph. Zero rows are dropped. */
export function chainFrom(src: SourcesResponse | null): ChainGraph {
  if (!src) return { nodes: [], links: [] }
  const nodes = new Map<string, ChainNode>()
  const links: ChainLink[] = []
  const node = (key: string, kind: ChainNodeKind, id: string, recipe: string | null) => {
    if (!nodes.has(key)) nodes.set(key, { key, kind, id, recipe, layer: 0, qIn: 0, qOut: 0, x: 0, y: 0, w: 0, h: 0 })
    return key
  }
  // A process that both takes and gives the same product (a farm collecting rain into its own tank and using it)
  // would draw a loop; such pairs become one link with the difference, in the direction that wins.
  const net = new Map<string, { proc: string; product: string; q: number }>()
  for (const [product, sides] of Object.entries(src.products)) {
    for (const side of ['consumed', 'produced'] as const) {
      for (const row of sides[side].rows) {
        if (row.quantity <= 0) continue
        let proc: string
        if (row.type === 'recipe' && 'recipe' in row) proc = node(`r:${row.machine}|${row.recipe}`, 'process', row.machine, row.recipe)
        else if (row.type === 'entity' && 'entity' in row) proc = node(`e:${row.entity}`, 'process', row.entity, null)
        else continue
        const key = `${proc}|${product}`
        const e = net.get(key) ?? { proc, product, q: 0 }
        e.q += side === 'produced' ? row.quantity : -row.quantity
        net.set(key, e)
      }
    }
  }
  for (const { proc, product, q } of net.values()) {
    if (q === 0) continue
    const p = node(pk(product), 'product', product, null)
    const [source, target] = q < 0 ? [p, proc] : [proc, p]
    links.push({ key: `${source}>${target}`, source, target, product, quantity: Math.abs(q), width: 0, back: false, path: '' })
  }
  // Processes left without links (fully netted out) are dropped.
  const linked = new Set(links.flatMap((l) => [l.source, l.target]))
  for (const k of [...nodes.keys()]) if (!linked.has(k)) nodes.delete(k)
  return { nodes: [...nodes.values()], links }
}

/** The part of the graph upstream and downstream of one product (everything it is made from and goes into). */
export function focusChain(g: ChainGraph, product: string): ChainGraph {
  const start = pk(product)
  if (!g.nodes.some((n) => n.key === start)) return g
  const walk = (from: 'source' | 'target', to: 'source' | 'target') => {
    const seen = new Set([start])
    const queue = [start]
    while (queue.length) {
      const k = queue.pop()!
      for (const l of g.links) if (l[from] === k && !seen.has(l[to])) (seen.add(l[to]), queue.push(l[to]))
    }
    return seen
  }
  const down = walk('source', 'target')
  const up = walk('target', 'source')
  // A link belongs to the focus if it runs within the upstream or within the downstream part.
  const links = g.links.filter((l) => (up.has(l.source) && up.has(l.target)) || (down.has(l.source) && down.has(l.target)))
  const keep = new Set(links.flatMap((l) => [l.source, l.target]))
  return { nodes: g.nodes.filter((n) => keep.has(n.key)), links }
}

export interface LayoutOptions {
  /** Width available; columns spread out to fill it, and the layout grows past it when it can't fit. */
  width: number
  nodeWidth: number
  minGap: number
  maxGap: number
  /** Minimum node height (room for its content). */
  minHeight: (n: ChainNode) => number
  nodeGap: number
  /** Height the busiest column's flows are scaled to. */
  flowHeight: number
  minLinkWidth: number
}

/** Lays the graph out in columns (copies nodes and links; the input is left alone). */
export function layoutChain(g: ChainGraph, o: LayoutOptions): ChainLayout {
  const nodes = g.nodes.map((n) => ({ ...n, qIn: 0, qOut: 0 }))
  const links = g.links.map((l) => ({ ...l }))
  const byKey = new Map(nodes.map((n) => [n.key, n]))
  const outs = new Map(nodes.map((n) => [n.key, [] as ChainLink[]]))
  const ins = new Map(nodes.map((n) => [n.key, [] as ChainLink[]]))
  for (const l of links) {
    outs.get(l.source)!.push(l)
    ins.get(l.target)!.push(l)
    byKey.get(l.source)!.qOut += l.quantity
    byKey.get(l.target)!.qIn += l.quantity
  }

  // 1. Break cycles: a DFS from the sources (busiest first) marks the edges that close a loop.
  const order = [...nodes].sort((a, b) => ins.get(a.key)!.length - ins.get(b.key)!.length || b.qOut - a.qOut)
  const state = new Map<string, 1 | 2>()
  const visit = (k: string) => {
    state.set(k, 1)
    for (const l of outs.get(k)!) {
      const s = state.get(l.target)
      if (s === 1) l.back = true
      else if (!s) visit(l.target)
    }
    state.set(k, 2)
  }
  for (const n of order) if (!state.has(n.key)) visit(n.key)
  const fwdOut = (k: string) => outs.get(k)!.filter((l) => !l.back)
  const fwdIn = (k: string) => ins.get(k)!.filter((l) => !l.back)

  // 2. Columns: longest path from the sources; then sources move right to sit just before their first consumer.
  const layer = new Map<string, number>()
  const depth = (k: string): number => {
    const known = layer.get(k)
    if (known !== undefined) return known
    const d = Math.max(-1, ...fwdIn(k).map((l) => depth(l.source))) + 1
    layer.set(k, d)
    return d
  }
  for (const n of nodes) n.layer = depth(n.key)
  for (const n of nodes) {
    const next = fwdOut(n.key)
    if (fwdIn(n.key).length === 0 && next.length) n.layer = Math.min(...next.map((l) => byKey.get(l.target)!.layer)) - 1
  }
  const layers = nodes.length ? Math.max(...nodes.map((n) => n.layer)) + 1 : 0
  const columns: ChainNode[][] = Array.from({ length: layers }, () => [])
  for (const n of nodes) columns[n.layer].push(n)

  // 3. Sizes: one scale for every link, so widths compare across the diagram.
  const flow = (n: ChainNode) => Math.max(n.qIn, n.qOut)
  const busiest = Math.max(1, ...columns.map((c) => c.reduce((a, n) => a + flow(n), 0)))
  const k = o.flowHeight / busiest
  // Links closing a cycle are drawn thin (dashed): their width would only add a loop across the diagram.
  for (const l of links) l.width = l.back ? o.minLinkWidth : Math.max(o.minLinkWidth, l.quantity * k)
  for (const n of nodes) {
    const stack = (ls: ChainLink[]) => ls.reduce((a, l) => a + l.width, 0)
    n.w = o.nodeWidth
    n.h = Math.max(o.minHeight(n), stack(ins.get(n.key)!), stack(outs.get(n.key)!))
  }
  const gap = layers > 1 ? Math.min(o.maxGap, Math.max(o.minGap, (o.width - layers * o.nodeWidth) / (layers - 1))) : 0
  for (const n of nodes) n.x = n.layer * (o.nodeWidth + gap)

  // 4. Order and place within columns: busiest first, then relax toward the weighted centre of the neighbours and
  // resolve overlaps (the d3-sankey approach).
  const colHeight = (c: ChainNode[]) => c.reduce((a, n) => a + n.h, 0) + Math.max(0, c.length - 1) * o.nodeGap
  const height = Math.max(0, ...columns.map(colHeight))
  for (const c of columns) {
    c.sort((a, b) => flow(b) - flow(a))
    let y = (height - colHeight(c)) / 2
    for (const n of c) ((n.y = y), (y += n.h + o.nodeGap))
  }
  const centre = (n: ChainNode) => n.y + n.h / 2
  const relax = (c: ChainNode[], neighbours: (n: ChainNode) => [ChainNode, number][]) => {
    for (const n of c) {
      const ws = neighbours(n)
      const total = ws.reduce((a, [, w]) => a + w, 0)
      if (total) n.y = ws.reduce((a, [m, w]) => a + centre(m) * w, 0) / total - n.h / 2
    }
    c.sort((a, b) => a.y - b.y)
    let y = 0
    for (const n of c) ((n.y = Math.max(n.y, y)), (y = n.y + n.h + o.nodeGap))
    y = height
    for (let i = c.length - 1; i >= 0; i--) ((c[i].y = Math.min(c[i].y, y - c[i].h)), (y = c[i].y - o.nodeGap))
  }
  const upstream = (n: ChainNode): [ChainNode, number][] => fwdIn(n.key).map((l) => [byKey.get(l.source)!, l.quantity])
  const downstream = (n: ChainNode): [ChainNode, number][] => fwdOut(n.key).map((l) => [byKey.get(l.target)!, l.quantity])
  for (let i = 0; i < 8; i++) {
    for (const c of columns.slice(1)) relax(c, upstream)
    for (const c of columns.slice(0, -1).reverse()) relax(c, downstream)
  }

  // 5. Links: stacked along each node edge in the order of the node at the other end, centred on the node.
  for (const n of nodes) {
    const o2 = outs.get(n.key)!.sort((a, b) => centre(byKey.get(a.target)!) - centre(byKey.get(b.target)!))
    const i2 = ins.get(n.key)!.sort((a, b) => centre(byKey.get(a.source)!) - centre(byKey.get(b.source)!))
    let y = centre(n) - o2.reduce((a, l) => a + l.width, 0) / 2
    for (const l of o2) ((l as ChainLink & { y0: number }).y0 = y + l.width / 2), (y += l.width)
    y = centre(n) - i2.reduce((a, l) => a + l.width, 0) / 2
    for (const l of i2) ((l as ChainLink & { y1: number }).y1 = y + l.width / 2), (y += l.width)
  }
  for (const l of links as (ChainLink & { y0: number; y1: number })[]) {
    const s = byKey.get(l.source)!
    const t = byKey.get(l.target)!
    const x0 = s.x + s.w
    const x1 = t.x
    if (x1 > x0) {
      const mid = (x0 + x1) / 2
      l.path = `M${x0},${l.y0} C${mid},${l.y0} ${mid},${l.y1} ${x1},${l.y1}`
    } else {
      // Back into an earlier column: loop out to the right, under both nodes, and in from the left.
      const r = 28
      const below = Math.max(s.y + s.h, t.y + t.h) + 14
      l.path = `M${x0},${l.y0} C${x0 + r},${l.y0} ${x0 + r},${below} ${x0},${below} L${x1},${below} C${x1 - r},${below} ${x1 - r},${l.y1} ${x1},${l.y1}`
    }
  }
  const width = layers ? (layers - 1) * (o.nodeWidth + gap) + o.nodeWidth : 0
  const hasBack = links.some((l) => l.back)
  return { nodes, links, width, height: height + (hasBack ? 24 : 0), layers }
}
