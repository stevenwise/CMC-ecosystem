import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import type { Relationship, Service } from './data'

/* ==========================================================================
 * Automatic layout for the ecosystem map.
 *
 * Method (see the layout spec): a force pass places nodes roughly and clusters
 * each group, then a DETERMINISTIC grid tidy pass packs each group's cards into
 * a uniform grid. The force step handles the big picture; the grid pass removes
 * the uneven, crossed spacing a force layout leaves behind.
 *
 * This only computes positions. Node rendering (the screenshot cards in
 * ServiceNode) is untouched.
 *
 * Requires: npm i d3-force @types/d3-force
 * ========================================================================== */

export interface XY {
  x: number
  y: number
}

// --- Tuning ---------------------------------------------------------------
// Match CARD_W / CARD_H to your real .service-node card so the grid clears the
// cards. The cards are tall, so the grid uses separate horizontal/vertical gaps.
const CARD_W = 300
const CARD_H = 340
const GAP_X = 60 // horizontal gap between cards inside a group grid
const GAP_Y = 56 // vertical gap between cards inside a group grid
const LINK_DISTANCE = 620 // resting length of a relationship (airier = larger)
const CHARGE = -8000 // node repulsion (more negative = more spread)
const GROUP_PULL = 0.05 // how strongly a node is pulled to its group anchor
const TICKS = 500 // headless iterations to let the force pass settle

interface SimNode extends SimulationNodeDatum {
  id: string
  group: string
}

// Which field groups the cards. Swap to s.organisation or s.party to group
// differently (e.g. by GDS / HMCTS, or Claimant / Defendant).
function groupOf(service: Service): string {
  return service.dept
}

// Spread the group anchors evenly on a circle so groups do not overlap.
function groupAnchors(groups: string[]): Record<string, XY> {
  const anchors: Record<string, XY> = {}
  const radius = Math.max(900, groups.length * 420)
  groups.forEach((g, i) => {
    const a = (i / groups.length) * Math.PI * 2
    anchors[g] = { x: Math.cos(a) * radius, y: Math.sin(a) * radius }
  })
  return anchors
}

// Compute a clean layout from the relationships. Returns serviceId -> {x, y}.
export function computeLayout(
  services: Service[],
  relationships: Relationship[],
): Record<string, XY> {
  if (services.length === 0) return {}

  const groups = [...new Set(services.map(groupOf))]
  const anchors = groupAnchors(groups)

  const nodes: SimNode[] = services.map((s) => ({ id: s.id, group: groupOf(s) }))
  const links: SimulationLinkDatum<SimNode>[] = relationships.map((r) => ({
    source: r.source,
    target: r.target,
  }))

  // 1. Force pass: repulsion + links + collision + a gentle per-group pull.
  const sim = forceSimulation<SimNode>(nodes)
    .force('charge', forceManyBody<SimNode>().strength(CHARGE))
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((n) => n.id)
        .distance(LINK_DISTANCE)
        .strength(0.4),
    )
    .force('collide', forceCollide<SimNode>(Math.max(CARD_W, CARD_H) * 0.55))
    .force('x', forceX<SimNode>((n) => anchors[n.group].x).strength(GROUP_PULL))
    .force('y', forceY<SimNode>((n) => anchors[n.group].y).strength(GROUP_PULL))
    .stop()

  for (let i = 0; i < TICKS; i++) sim.tick()

  // 2. Deterministic grid tidy: pack each group into a uniform near-square grid,
  //    centred where the force step left that group. Uses the real card size.
  const byGroup = new Map<string, SimNode[]>()
  for (const n of nodes) {
    const arr = byGroup.get(n.group) ?? []
    arr.push(n)
    byGroup.set(n.group, arr)
  }

  const out: Record<string, XY> = {}
  for (const group of byGroup.values()) {
    const cx = group.reduce((s, n) => s + (n.x ?? 0), 0) / group.length
    const cy = group.reduce((s, n) => s + (n.y ?? 0), 0) / group.length
    const cols = Math.ceil(Math.sqrt(group.length))
    const gridRows = Math.ceil(group.length / cols)
    group.forEach((n, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      out[n.id] = {
        x: cx + (col - (cols - 1) / 2) * (CARD_W + GAP_X),
        y: cy + (row - (gridRows - 1) / 2) * (CARD_H + GAP_Y),
      }
    })
  }
  return out
}

/* ==========================================================================
 * Authoring helpers (unchanged) — used by store.ts when a page is added by hand.
 * These seed a position for a new node; computeLayout re-arranges everything on
 * the next render, so they only matter if you turn the automatic layout off.
 * ========================================================================== */

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
export function positionForNewSpoke(
  hub: Service,
  hubConnectionCount: number,
): { x: number; y: number } {
  const startAngle = Math.PI * 0.15
  const endAngle = Math.PI * 0.85
  const slot = hubConnectionCount % SPOKE_SLOTS
  const t = slot / (SPOKE_SLOTS - 1)
  const angle = startAngle + t * (endAngle - startAngle)
  return {
    x: hub.position.x + Math.cos(angle) * SPOKE_RADIUS,
    y: hub.position.y + Math.sin(angle) * SPOKE_RADIUS,
  }
}
