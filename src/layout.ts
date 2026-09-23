import type { Service } from './data'

const HUB_BAND_Y = 180
const HUB_SPACING = 320
const HUB_START_X = 250

const SPOKE_RADIUS = 320
const SPOKE_SLOTS = 6

// Position for a brand-new main page — extends the horizontal band of existing hubs.
export function positionForNewHub(existingServices: Service[]): { x: number; y: number } {
  if (existingServices.length === 0) {
    return { x: HUB_START_X, y: HUB_BAND_Y }
  }
  const maxX = Math.max(...existingServices.map((s) => s.position.x))
  return { x: maxX + HUB_SPACING, y: HUB_BAND_Y }
}

// Position for a new connected page — placed in an arc below its hub.
// hubConnectionCount is used as the slot index so successive spokes fan out.
export function positionForNewSpoke(
  hub: Service,
  hubConnectionCount: number,
): { x: number; y: number } {
  const startAngle = Math.PI * 0.15 // just past east, downward
  const endAngle = Math.PI * 0.85 // just before west, downward
  const slot = hubConnectionCount % SPOKE_SLOTS
  const t = slot / (SPOKE_SLOTS - 1)
  const angle = startAngle + t * (endAngle - startAngle)
  return {
    x: hub.position.x + Math.cos(angle) * SPOKE_RADIUS,
    y: hub.position.y + Math.sin(angle) * SPOKE_RADIUS,
  }
}

interface GraphNode {
  id: string
}

interface GraphEdge {
  source: string
  target: string
}

// Ideal spring length between two *connected* cards — tuned to the card
// footprint (~230×170px with the preview) so linked pages settle close
// without overlapping.
const IDEAL_EDGE_LENGTH = 300
const FR_ITERATIONS = 400
const COMPONENT_GUTTER = 160
const SINGLETON_GRID_GAP = 260
const SINGLETON_PER_ROW = 5

// Fruchterman–Reingold force-directed layout for one connected component:
// every node repels every other node (so unrelated pages spread out), every
// edge pulls its two endpoints together (so linked pages cluster), and the
// whole thing cools over a fixed number of iterations so it settles instead
// of oscillating. This is what gives an organic, hub-and-cluster read
// (mirroring how Content Explorer's own map lays a graph out) instead of the
// rigid concentric rings a purely geometric layout would produce.
function forceDirectedLayout(
  ids: string[],
  edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
  const n = ids.length
  const positions = new Map<string, { x: number; y: number }>()
  if (n === 0) return positions
  if (n === 1) {
    positions.set(ids[0], { x: 0, y: 0 })
    return positions
  }

  const k = IDEAL_EDGE_LENGTH
  // Seed on a circle, not randomly — keeps layout deterministic (re-importing
  // the same CSV lands in the same place) while still giving every node a
  // distinct starting point for the repulsion forces to act on.
  const seedRadius = (k * n) / (2 * Math.PI)
  const x = new Map<string, number>()
  const y = new Map<string, number>()
  ids.forEach((id, i) => {
    const angle = (i / n) * Math.PI * 2
    x.set(id, Math.cos(angle) * seedRadius)
    y.set(id, Math.sin(angle) * seedRadius)
  })

  let temperature = seedRadius / 4

  for (let iter = 0; iter < FR_ITERATIONS; iter++) {
    const dispX = new Map<string, number>(ids.map((id) => [id, 0]))
    const dispY = new Map<string, number>(ids.map((id) => [id, 0]))

    // Repulsion — every pair of nodes pushes apart, inverse-linear in distance.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = ids[i]
        const b = ids[j]
        let dx = x.get(a)! - x.get(b)!
        let dy = y.get(a)! - y.get(b)!
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
        const force = (k * k) / dist
        dx = (dx / dist) * force
        dy = (dy / dist) * force
        dispX.set(a, dispX.get(a)! + dx)
        dispY.set(a, dispY.get(a)! + dy)
        dispX.set(b, dispX.get(b)! - dx)
        dispY.set(b, dispY.get(b)! - dy)
      }
    }

    // Attraction — connected nodes pull together, proportional to distance.
    for (const e of edges) {
      if (!x.has(e.source) || !x.has(e.target) || e.source === e.target) continue
      let dx = x.get(e.source)! - x.get(e.target)!
      let dy = y.get(e.source)! - y.get(e.target)!
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const force = (dist * dist) / k
      dx = (dx / dist) * force
      dy = (dy / dist) * force
      dispX.set(e.source, dispX.get(e.source)! - dx)
      dispY.set(e.source, dispY.get(e.source)! - dy)
      dispX.set(e.target, dispX.get(e.target)! + dx)
      dispY.set(e.target, dispY.get(e.target)! + dy)
    }

    // Apply displacement, capped by the cooling temperature so movement
    // settles down instead of oscillating.
    for (const id of ids) {
      const dx = dispX.get(id)!
      const dy = dispY.get(id)!
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const capped = Math.min(dist, temperature)
      x.set(id, x.get(id)! + (dx / dist) * capped)
      y.set(id, y.get(id)! + (dy / dist) * capped)
    }
    temperature *= 1 - iter / FR_ITERATIONS
  }

  ids.forEach((id) => positions.set(id, { x: x.get(id)!, y: y.get(id)! }))
  return positions
}

function boundingSize(positions: Map<string, { x: number; y: number }>): {
  width: number
  height: number
} {
  const xs = [...positions.values()].map((p) => p.x)
  const ys = [...positions.values()].map((p) => p.y)
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
}

// Lays out a whole graph that arrives with no positions of its own — used
// when importing a CSV that only carries titles and links. Splits the nodes
// into connected components so unrelated clusters never overlap, runs each
// multi-page component through the force-directed simulation above, and
// shelf-packs the resulting clusters left to right, wrapping rows — a tight,
// organic arrangement rather than a fixed grid of equal-sized cells. Nodes
// with no connections at all are pulled out into their own compact grid
// underneath, since a lone page doesn't need — and would only waste — a
// full cluster slot to itself.
export function autoLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return positions

  const adjacency = new Map<string, string[]>()
  nodes.forEach((n) => adjacency.set(n.id, []))
  edges.forEach((e) => {
    if (!adjacency.has(e.source) || !adjacency.has(e.target)) return
    adjacency.get(e.source)!.push(e.target)
    adjacency.get(e.target)!.push(e.source)
  })

  const seen = new Set<string>()
  const components: string[][] = []
  for (const node of nodes) {
    if (seen.has(node.id)) continue
    const queue = [node.id]
    seen.add(node.id)
    const component: string[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      component.push(id)
      for (const next of adjacency.get(id) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    components.push(component)
  }

  const clusters = components.filter((c) => c.length > 1)
  const singletons = components.filter((c) => c.length === 1)
  // Largest clusters first so the map reads hub-first, left to right.
  clusters.sort((a, b) => b.length - a.length)

  // Shelf-pack the clusters: place each one after the last, wrapping to a
  // new row once a row gets too wide, so cluster size — not a fixed grid —
  // drives the spacing.
  const maxRowWidth = Math.max(1600, IDEAL_EDGE_LENGTH * Math.sqrt(nodes.length) * 2.2)
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0

  clusters.forEach((component) => {
    const local = forceDirectedLayout(component, edges)
    const size = boundingSize(local)

    if (cursorX > 0 && cursorX + size.width > maxRowWidth) {
      cursorX = 0
      cursorY += rowHeight + COMPONENT_GUTTER
      rowHeight = 0
    }

    const localXs = [...local.values()].map((p) => p.x)
    const localYs = [...local.values()].map((p) => p.y)
    const minX = Math.min(...localXs)
    const minY = Math.min(...localYs)

    component.forEach((id) => {
      const p = local.get(id)!
      positions.set(id, { x: cursorX + (p.x - minX), y: cursorY + (p.y - minY) })
    })

    cursorX += size.width + COMPONENT_GUTTER
    rowHeight = Math.max(rowHeight, size.height)
  })

  // Isolated pages go in their own compact grid below the clustered map.
  if (singletons.length > 0) {
    if (cursorX > 0) cursorY += rowHeight + COMPONENT_GUTTER
    singletons.forEach((component, i) => {
      const id = component[0]
      const col = i % SINGLETON_PER_ROW
      const row = Math.floor(i / SINGLETON_PER_ROW)
      positions.set(id, {
        x: col * SINGLETON_GRID_GAP,
        y: cursorY + row * SINGLETON_GRID_GAP,
      })
    })
  }

  return positions
}
