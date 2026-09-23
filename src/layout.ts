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

const AUTO_RING_BASE_RADIUS = 260
const AUTO_RING_GAP = 260
const AUTO_COMPONENT_SPACING = 720
const AUTO_COMPONENTS_PER_ROW = 3

// Lays out a whole graph that arrives with no positions of its own — used
// when importing a CSV that only carries titles and links. Splits the nodes
// into connected components (so unrelated clusters don't overlap), and
// within each component places the highest-degree node at the centre with
// the rest ringed outward by BFS distance from it, generalising the
// hub-and-spoke shape above to an arbitrary graph.
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
  // Largest components first so the map reads hub-first, left to right.
  components.sort((a, b) => b.length - a.length)

  components.forEach((component, componentIndex) => {
    const root = component.reduce((best, id) =>
      (adjacency.get(id)?.length ?? 0) > (adjacency.get(best)?.length ?? 0) ? id : best,
    component[0])

    const depth = new Map<string, number>([[root, 0]])
    const order = [root]
    let head = 0
    while (head < order.length) {
      const id = order[head++]
      const d = depth.get(id)!
      for (const next of adjacency.get(id) ?? []) {
        if (depth.has(next)) continue
        depth.set(next, d + 1)
        order.push(next)
      }
    }

    const byDepth = new Map<number, string[]>()
    component.forEach((id) => {
      const d = depth.get(id) ?? 1
      if (!byDepth.has(d)) byDepth.set(d, [])
      byDepth.get(d)!.push(id)
    })

    const col = componentIndex % AUTO_COMPONENTS_PER_ROW
    const row = Math.floor(componentIndex / AUTO_COMPONENTS_PER_ROW)
    const originX = col * AUTO_COMPONENT_SPACING
    const originY = row * AUTO_COMPONENT_SPACING

    byDepth.forEach((ids, d) => {
      if (d === 0) {
        positions.set(root, { x: originX, y: originY })
        return
      }
      const radius = AUTO_RING_BASE_RADIUS + (d - 1) * AUTO_RING_GAP
      ids.forEach((id, i) => {
        const angle = (i / ids.length) * Math.PI * 2
        positions.set(id, {
          x: originX + Math.cos(angle) * radius,
          y: originY + Math.sin(angle) * radius,
        })
      })
    })
  })

  return positions
}
