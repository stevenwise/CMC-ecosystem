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

export interface GuideGroup {
  label: string
  x: number
  y: number
  width: number
  height: number
}

// Matches src/index.css's .service-node footprint (200–230px wide, roughly
// 170–190px tall with the preview, pill and name) — anything that needs to
// clear a card's actual edges, not just the point position autoLayout
// placed it at, uses these.
const CARD_WIDTH = 230
const CARD_HEIGHT = 190

// Ideal spring length between two *connected* cards — tuned to the card
// footprint so linked pages settle close without overlapping.
const IDEAL_EDGE_LENGTH = 260
const FR_ITERATIONS = 400
// At least as big as MIN_NODE_DISTANCE below — a cluster's bounding box is
// tight to its content, so a smaller gutter than the node-collision minimum
// let cards from two *different* clusters land closer than same-cluster
// cards ever could.
const COMPONENT_GUTTER = 260
const SINGLETON_GRID_GAP = 260
const SINGLETON_PER_ROW = 5

// Fruchterman–Reingold force-directed layout: every node repels every other
// node (so unrelated pages spread out), every edge pulls its two endpoints
// together (so linked pages cluster), and the whole thing cools over a
// fixed number of iterations so it settles instead of oscillating.
//
// `fixed` marks ids that take part in every force — other nodes still get
// pushed and pulled by them — but never move themselves. autoLayout uses
// this for a guide's grid box: the box is a known-fixed point the loose
// "extra" pages (not officially part of the guide, but linked to it) get
// pulled toward, without the box itself drifting or the sim needing to
// know it's actually a multi-card rectangle rather than one point.
function forceDirectedLayout(
  ids: string[],
  edges: GraphEdge[],
  fixed?: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const n = ids.length
  const positions = new Map<string, { x: number; y: number }>()
  if (n === 0) return positions
  if (n === 1 && !fixed?.has(ids[0])) {
    positions.set(ids[0], { x: 0, y: 0 })
    return positions
  }

  const k = IDEAL_EDGE_LENGTH
  // Seed on a circle, not randomly — keeps layout deterministic (re-importing
  // the same CSV lands in the same place) while still giving every node a
  // distinct starting point for the repulsion forces to act on. Fixed nodes
  // seed at their real (fixed) position instead.
  const seedRadius = (k * n) / (2 * Math.PI)
  const x = new Map<string, number>()
  const y = new Map<string, number>()
  ids.forEach((id, i) => {
    const fixedPos = fixed?.get(id)
    if (fixedPos) {
      x.set(id, fixedPos.x)
      y.set(id, fixedPos.y)
      return
    }
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
    // settles down instead of oscillating. Fixed nodes never move.
    for (const id of ids) {
      if (fixed?.has(id)) continue
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

function boundingSize(
  local: Map<string, { x: number; y: number }>,
  blocks: Array<{ x: number; y: number; width: number; height: number }> = [],
): { width: number; height: number } {
  const xs = [...local.values()].map((p) => p.x)
  const ys = [...local.values()].map((p) => p.y)
  blocks.forEach((b) => {
    xs.push(b.x, b.x + b.width)
    ys.push(b.y, b.y + b.height)
  })
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

// Pushes any of `ids` that ended up inside one of `blocks`' rectangles back
// out to its nearest edge. The force sim in autoLayout treats a guide's box
// as a single fixed *point* (its centre) so loose pages get pulled toward
// it — but the box is actually a multi-card rectangle, and nothing in a
// point-to-point attraction stops another page from landing inside its
// bounds. This is the actual guarantee that a page can only ever appear
// inside a guide's box if it's genuinely one of that guide's own pages.
// Clearance beyond the block's own padding (GROUP_PADDING_X etc., already
// baked into its box). Needs to be big enough that once it's added to that
// padding, a card just outside the box is still at least MIN_NODE_DISTANCE
// from a card just inside it — otherwise "ejected" still reads as crowded.
const BLOCK_MARGIN = 200

function ejectFromBlocks(
  ids: string[],
  positions: Map<string, { x: number; y: number }>,
  blocks: Array<{ x: number; y: number; width: number; height: number }>,
): void {
  for (const id of ids) {
    const p = positions.get(id)!
    for (const block of blocks) {
      const left = block.x - BLOCK_MARGIN
      const right = block.x + block.width + BLOCK_MARGIN
      const top = block.y - BLOCK_MARGIN
      const bottom = block.y + block.height + BLOCK_MARGIN
      if (p.x <= left || p.x >= right || p.y <= top || p.y >= bottom) continue
      const distLeft = p.x - left
      const distRight = right - p.x
      const distTop = p.y - top
      const distBottom = bottom - p.y
      const minDist = Math.min(distLeft, distRight, distTop, distBottom)
      if (minDist === distLeft) p.x = left
      else if (minDist === distRight) p.x = right
      else if (minDist === distTop) p.y = top
      else p.y = bottom
    }
  }
}

// Packs a guide's own pages into a tight, deterministic grid rather than
// leaving it to physics. A guide's pages are *known* to belong together —
// that's what `part_of_guide` means — so there's nothing to discover by
// simulating springs between them, and a real guide's internal link shape
// is often sparse or tree-like (one overview page linking out to several
// single-purpose forms), which a force layout spreads into thin branches
// rather than the tight cluster a guide box should read as.
const GRID_GAP_X = 40
const GRID_GAP_Y = 40
const GRID_MAX_COLS = 4

function gridLayout(ids: string[]): {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
} {
  const cols = Math.max(1, Math.min(GRID_MAX_COLS, Math.ceil(Math.sqrt(ids.length))))
  const rows = Math.ceil(ids.length / cols)
  const positions = new Map<string, { x: number; y: number }>()
  ids.forEach((id, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions.set(id, {
      x: col * (CARD_WIDTH + GRID_GAP_X),
      y: row * (CARD_HEIGHT + GRID_GAP_Y),
    })
  })
  return {
    positions,
    width: cols * CARD_WIDTH + (cols - 1) * GRID_GAP_X,
    height: rows * CARD_HEIGHT + (rows - 1) * GRID_GAP_Y,
  }
}

const GROUP_PADDING_X = 60
const GROUP_PADDING_TOP = 50
const GROUP_PADDING_BOTTOM = 30
const BLOCK_GUTTER = 100

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

interface PreparedCluster {
  cluster: string[]
  local: Map<string, { x: number; y: number }>
  size: { width: number; height: number }
  blocks: GuideGroup[]
}

// Lays out one cluster (one Louvain community): guide-tagged pages are
// packed into fixed grid "blocks" (one per distinct guide in this
// cluster — almost always at most one in practice), and every other page
// is force-directed into place, pulled toward whichever block(s) it links
// to (via a fixed anchor at that block's centre) same as it would be pulled
// toward any other connected page, then physically ejected from any
// block's rectangle it still ended up inside. A cluster with no guide
// pages at all degenerates to exactly the plain force-directed layout this
// replaced — every page is an "extra" and there are no blocks to eject
// from.
function layoutCluster(cluster: string[], internalEdges: GraphEdge[], partOfGuide?: Map<string, string>): PreparedCluster {
  const byGuide = new Map<string, string[]>()
  cluster.forEach((id) => {
    const guide = partOfGuide?.get(id)
    if (!guide) return
    if (!byGuide.has(guide)) byGuide.set(guide, [])
    byGuide.get(guide)!.push(id)
  })
  // A "guide" with only one page in this cluster isn't worth a box —
  // treat it as just another extra.
  for (const [guide, members] of byGuide) {
    if (members.length < 2) byGuide.delete(guide)
  }
  const guidedIds = new Set([...byGuide.values()].flat())
  const extras = cluster.filter((id) => !guidedIds.has(id))

  const local = new Map<string, { x: number; y: number }>()
  const blocks: GuideGroup[] = []
  const anchors = new Map<string, { x: number; y: number }>()

  let blockCursorX = 0
  byGuide.forEach((members, label) => {
    const grid = gridLayout(members)
    const originX = blockCursorX
    members.forEach((id) => {
      const p = grid.positions.get(id)!
      local.set(id, { x: originX + p.x, y: p.y })
    })
    const box: GuideGroup = {
      label,
      x: originX - GROUP_PADDING_X,
      y: -GROUP_PADDING_TOP,
      width: grid.width + GROUP_PADDING_X * 2,
      height: grid.height + GROUP_PADDING_TOP + GROUP_PADDING_BOTTOM,
    }
    blocks.push(box)
    anchors.set(`block:${label}`, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
    blockCursorX += grid.width + BLOCK_GUTTER
  })

  if (extras.length > 0) {
    // Edges into a guide's pages pull an extra toward that guide's block
    // (via its fixed anchor) exactly as they'd pull it toward any other
    // connected page; edges entirely within one block, or between two
    // blocks (both ends fixed either way), do nothing and are dropped.
    const extraEdges: GraphEdge[] = []
    internalEdges.forEach((e) => {
      const sourceGuide = partOfGuide?.get(e.source)
      const targetGuide = partOfGuide?.get(e.target)
      const sourceId = sourceGuide && byGuide.has(sourceGuide) ? `block:${sourceGuide}` : e.source
      const targetId = targetGuide && byGuide.has(targetGuide) ? `block:${targetGuide}` : e.target
      if (sourceId === targetId) return
      if (sourceId.startsWith('block:') && targetId.startsWith('block:')) return
      extraEdges.push({ source: sourceId, target: targetId })
    })

    const extraIds = [...extras, ...anchors.keys()]
    const extraLocal = forceDirectedLayout(extraIds, extraEdges, anchors)
    extras.forEach((id) => local.set(id, extraLocal.get(id)!))
    resolveOverlaps(extras, local)
    ejectFromBlocks(extras, local, blocks)
    resolveOverlaps(extras, local)
  }

  return { cluster, local, size: boundingSize(local, blocks), blocks }
}

// Lays out a whole graph that arrives with no positions of its own — used
// when importing a CSV that only carries titles and links. Detects the
// topical sub-groups inside it (see detectCommunities above — plain
// connected components aren't enough once "related" links tie the whole
// graph together), lays out each multi-page group (see layoutCluster
// above), and shelf-packs the resulting clusters left to right, wrapping
// rows — a tight, organic arrangement rather than a fixed grid of
// equal-sized cells. Nodes with no connections at all are pulled out into
// their own compact grid underneath, since a lone page doesn't need — and
// would only waste — a full cluster slot to itself.
export function autoLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  partOfGuide?: Map<string, string>,
): { positions: Map<string, { x: number; y: number }>; groups: GuideGroup[] } {
  const positions = new Map<string, { x: number; y: number }>()
  const groups: GuideGroup[] = []
  if (nodes.length === 0) return { positions, groups }

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

  // Lay out every cluster before packing, not as each one is placed —
  // packing needs to know actual sizes up front. Community sizes can vary
  // wildly (a handful of pages vs. dozens), and a cluster's *shape* varies
  // just as much. Sizing the grid from a raw cluster *count* — as if every
  // cluster took up roughly the same space — let one oversized or
  // elongated cluster blow the whole canvas out in one dimension while the
  // rest sat mostly empty.
  const prepared = clusters.map((cluster) => {
    const clusterSet = new Set(cluster)
    const internalEdges = edges.filter((e) => clusterSet.has(e.source) && clusterSet.has(e.target))
    return layoutCluster(cluster, internalEdges, partOfGuide)
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
    groupBoxes: Array<GuideGroup>
  }
  const shelves: Shelf[] = []
  let openShelf: Shelf | null = null

  prepared.forEach(({ cluster, local, size, blocks }) => {
    if (!openShelf || openShelf.cursorX + size.width > rowWidthBudget) {
      openShelf = { cursorX: 0, height: 0, entries: [], groupBoxes: [] }
      shelves.push(openShelf)
    }
    const shelf = openShelf

    const localXs = [...local.values()].map((p) => p.x).concat(blocks.flatMap((b) => [b.x, b.x + b.width]))
    const localYs = [...local.values()].map((p) => p.y).concat(blocks.flatMap((b) => [b.y, b.y + b.height]))
    const minX = Math.min(...localXs)
    const minY = Math.min(...localYs)

    cluster.forEach((id) => {
      const p = local.get(id)!
      // x is final; y is still shelf-relative until shelves are stacked below.
      shelf.entries.push({ id, x: shelf.cursorX + (p.x - minX), y: p.y - minY })
    })

    blocks.forEach((block) => {
      shelf.groupBoxes.push({
        label: block.label,
        x: shelf.cursorX + (block.x - minX),
        y: block.y - minY,
        width: block.width,
        height: block.height,
      })
    })

    shelf.cursorX += size.width + COMPONENT_GUTTER
    shelf.height = Math.max(shelf.height, size.height)
  })

  let shelfY = 0
  shelves.forEach((shelf) => {
    shelf.entries.forEach(({ id, x, y }) => positions.set(id, { x, y: y + shelfY }))
    shelf.groupBoxes.forEach((box) => groups.push({ ...box, y: box.y + shelfY }))
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

  return { positions, groups }
}
