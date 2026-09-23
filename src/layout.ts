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
const IDEAL_EDGE_LENGTH = 260
const FR_ITERATIONS = 400
// At least as big as MIN_NODE_DISTANCE below — a cluster's bounding box is
// tight to its content, so a smaller gutter than the node-collision minimum
// let cards from two *different* clusters land closer than same-cluster
// cards ever could.
const COMPONENT_GUTTER = 260
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

// Nudges apart any pair of nodes still closer than a card's footprint after
// the force simulation has settled — the springs-and-repulsion model above
// gives an organic *shape*, but on a dense real-world graph (a hub with a
// dozen+ neighbours all pulling at once) it can still leave a couple of
// cards overlapping. A handful of cheap separation passes cleans that up
// without disturbing the overall layout it already found.
const MIN_NODE_DISTANCE = 240
const SEPARATION_PASSES = 40

function resolveOverlaps(ids: string[], positions: Map<string, { x: number; y: number }>): void {
  for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
    let movedAny = false
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = positions.get(ids[i])!
        const b = positions.get(ids[j])!
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
        if (dist >= MIN_NODE_DISTANCE) continue
        const push = (MIN_NODE_DISTANCE - dist) / 2
        const ux = dx / dist
        const uy = dy / dist
        a.x += ux * push
        a.y += uy * push
        b.x -= ux * push
        b.y -= uy * push
        movedAny = true
      }
    }
    if (!movedAny) break
  }
}

// Splits a graph into topical sub-groups by greedily optimising modularity
// (the Louvain method's local-moving phase): every node starts in its own
// group, then each node moves to whichever neighbouring group would gain it
// the most modularity — more internal links than you'd expect by chance —
// repeating until nothing moves. This replaces an earlier label-propagation
// version (each node just adopts its most common neighbour's label) that
// works fine on a sparse test graph but collapses into one giant label on a
// graph as densely cross-linked as real GOV.UK content actually is: with
// "related link" and shared destinations like "Find a legal adviser" tying
// most pages together, the majority vote has nothing to stop it drifting to
// one dominant label. Modularity gives every move an actual quality score
// instead of a popularity contest, so it keeps finding structure a plain
// connected-components split (one blob, the instant anything links across
// topics) or label propagation (also one blob, once links get dense enough)
// both miss. A node with no neighbours simply has nowhere better to move
// to, i.e. stays a singleton group — so this also covers what connected
// components used to handle.
//
// fixedGroups (from Content Explorer's own `part_of_guide` column) seeds a
// node straight into its guide's group and excludes it from the moving
// loop entirely, so pages GOV.UK itself already says belong to the same
// multi-part guide always land in the same cluster — this is the actual
// grouping Content Explorer's own map draws as a labelled box, and no
// amount of link-topology inference recovers it as reliably as just using
// it. Pages without a `part_of_guide` (standalone guides, forms, shared
// destinations) are still free to move and get placed by modularity alone.
function detectCommunities(
  ids: string[],
  adjacency: Map<string, string[]>,
  fixedGroups?: Map<string, string>,
): Map<string, string> {
  const community = new Map<string, string>(ids.map((id) => [id, fixedGroups?.get(id) ?? id]))
  const degree = new Map<string, number>(ids.map((id) => [id, (adjacency.get(id) ?? []).length]))
  const totalDegree = [...degree.values()].reduce((sum, d) => sum + d, 0)
  const m = totalDegree / 2 // edge count (adjacency lists each edge from both ends)
  if (m === 0) return community

  // Total degree of every node currently in each community — the piece of
  // the modularity formula that penalises dumping everything into one
  // group. Summed per community label rather than seeded 1:1 from `degree`,
  // since fixedGroups means several ids can already share a starting label.
  const communityDegree = new Map<string, number>()
  for (const id of ids) {
    const c = community.get(id)!
    communityDegree.set(c, (communityDegree.get(c) ?? 0) + degree.get(id)!)
  }

  const order = [...ids].sort()
  const maxPasses = 40

  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false

    for (const id of order) {
      if (fixedGroups?.has(id)) continue // pinned to its guide, never reconsidered

      const current = community.get(id)!
      const ki = degree.get(id)!

      const linksToCommunity = new Map<string, number>()
      for (const neighbor of adjacency.get(id) ?? []) {
        const c = community.get(neighbor)!
        linksToCommunity.set(c, (linksToCommunity.get(c) ?? 0) + 1)
      }
      if (linksToCommunity.size === 0) continue

      // Pull id out of its current community before comparing options, so
      // staying put is judged on the same footing as every alternative —
      // it needs a real computed gain here, not a sentinel, or a node ends
      // up chasing whichever neighbouring community it evaluates first
      // even when that move actively hurts modularity.
      communityDegree.set(current, communityDegree.get(current)! - ki)

      let best = current
      let bestGain =
        (linksToCommunity.get(current) ?? 0) / m - (communityDegree.get(current)! * ki) / (2 * m * m)
      for (const [c, kiIn] of linksToCommunity) {
        if (c === current) continue
        const gain = kiIn / m - (communityDegree.get(c)! * ki) / (2 * m * m)
        if (gain > bestGain + 1e-12) {
          bestGain = gain
          best = c
        }
      }

      communityDegree.set(best, (communityDegree.get(best) ?? 0) + ki)
      if (best !== current) {
        community.set(id, best)
        moved = true
      }
    }

    if (!moved) break
  }

  return community
}

// Lays out a whole graph that arrives with no positions of its own — used
// when importing a CSV that only carries titles and links. Detects the
// topical sub-groups inside it (see detectCommunities above — plain
// connected components aren't enough once "related" links tie the whole
// graph together), runs each multi-page group through the force-directed
// simulation above using only its own internal links, and shelf-packs the
// resulting clusters left to right, wrapping rows — a tight, organic
// arrangement rather than a fixed grid of equal-sized cells. Nodes with no
// connections at all are pulled out into their own compact grid underneath,
// since a lone page doesn't need — and would only waste — a full cluster
// slot to itself.
export function autoLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  partOfGuide?: Map<string, string>,
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

  const ids = nodes.map((n) => n.id)
  const labels = detectCommunities(ids, adjacency, partOfGuide)
  const grouped = new Map<string, string[]>()
  ids.forEach((id) => {
    const label = labels.get(id)!
    if (!grouped.has(label)) grouped.set(label, [])
    grouped.get(label)!.push(id)
  })

  const clusters = [...grouped.values()].filter((c) => c.length > 1)
  const singletons = [...grouped.values()].filter((c) => c.length === 1)
  // Largest clusters first so the map reads hub-first, and so the greedy
  // shelf-balancing below (which always adds to the currently narrowest
  // shelf) seats the big ones before it has to fit the small ones in
  // around them.
  clusters.sort((a, b) => b.length - a.length)

  // Force-layout every cluster before packing, not as each one is placed —
  // packing needs to know actual sizes up front. Community sizes can vary
  // wildly (a handful of pages vs. dozens), and a cluster's *shape* varies
  // just as much: a tightly cross-linked group settles into a compact
  // blob, while a chain-like one stretches out long and thin. Sizing the
  // grid from a raw cluster *count* — as if every cluster took up roughly
  // the same space — let one oversized or elongated cluster blow the whole
  // canvas out in one dimension while the rest sat mostly empty.
  const prepared = clusters.map((cluster) => {
    const clusterSet = new Set(cluster)
    const internalEdges = edges.filter((e) => clusterSet.has(e.source) && clusterSet.has(e.target))
    const local = forceDirectedLayout(cluster, internalEdges)
    resolveOverlaps(cluster, local)
    return { cluster, local, size: boundingSize(local) }
  })

  // Distribute the clusters across a grid of shelves rather than one long
  // row. The row width budget comes from the clusters' total *area*, not
  // their count, so it scales with how much space they actually need —
  // aiming for a roughly square canvas whatever mix of cluster sizes and
  // shapes community detection happened to find.
  const totalArea = prepared.reduce((sum, p) => sum + p.size.width * p.size.height, 0)
  const rowWidthBudget = Math.max(1200, Math.sqrt(totalArea) * 1.15)

  interface Shelf {
    cursorX: number
    height: number
    entries: Array<{ id: string; x: number; y: number }>
  }
  const shelves: Shelf[] = []
  let openShelf: Shelf | null = null

  prepared.forEach(({ cluster, local, size }) => {
    if (!openShelf || openShelf.cursorX + size.width > rowWidthBudget) {
      openShelf = { cursorX: 0, height: 0, entries: [] }
      shelves.push(openShelf)
    }
    const shelf = openShelf

    const localXs = [...local.values()].map((p) => p.x)
    const localYs = [...local.values()].map((p) => p.y)
    const minX = Math.min(...localXs)
    const minY = Math.min(...localYs)

    cluster.forEach((id) => {
      const p = local.get(id)!
      // x is final; y is still shelf-relative until shelves are stacked below.
      shelf.entries.push({ id, x: shelf.cursorX + (p.x - minX), y: p.y - minY })
    })

    shelf.cursorX += size.width + COMPONENT_GUTTER
    shelf.height = Math.max(shelf.height, size.height)
  })

  let shelfY = 0
  shelves.forEach((shelf) => {
    shelf.entries.forEach(({ id, x, y }) => positions.set(id, { x, y: y + shelfY }))
    if (shelf.entries.length > 0) shelfY += shelf.height + COMPONENT_GUTTER
  })

  // Isolated pages go in their own compact grid below the clustered map.
  if (singletons.length > 0) {
    singletons.forEach((cluster, i) => {
      const id = cluster[0]
      const col = i % SINGLETON_PER_ROW
      const row = Math.floor(i / SINGLETON_PER_ROW)
      positions.set(id, {
        x: col * SINGLETON_GRID_GAP,
        y: shelfY + row * SINGLETON_GRID_GAP,
      })
    })
  }

  return positions
}
