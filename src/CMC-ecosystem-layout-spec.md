# CMC ecosystem map: layout upgrade spec

Tailored to the `stevenwise/CMC-ecosystem` build (React 19 + React Flow
`@xyflow/react` v12 + Vite + TypeScript). It replaces the current manual
positioning with an automatic layout that reads clearly: nodes grouped by
department, evenly spaced, links kept short, and the whole map framed on load.

Derived from a sister build (GOV.UK Content Explorer) whose node layout is the
thing we want to bring across.

---

## 1. Why the current layout looks scattered

- Node positions are **hand-authored** in `src/data.ts` (`Service.position`), and
  `src/layout.ts` only offers `positionForNewHub` (a horizontal band) and
  `positionForNewSpoke` (an arc below a hub). There is **no layout algorithm**, so
  spacing and grouping are eyeballed and edges cross.
- `EcosystemMap.tsx` renders straight from `service.position` with a zoom fan-out
  effect. Nothing computes positions from the actual relationships.

The fix is to **compute positions from the relationship graph**, then tidy each
group, then frame. Keep everything else (React Flow, the card node, the store).

---

## 2. The method (three steps)

The one idea worth copying: **don't rely on a force layout alone.** Run a force
pass to place things roughly, then a **deterministic grid tidy pass** per group,
then frame the viewport. The force step handles the big picture; the tidy pass
removes the uneven, crossed spacing a force layout leaves behind.

1. **Force pass** — a headless force simulation over `RELATIONSHIPS`, with a weak
   pull of each node toward its **department anchor** so departments cluster
   (the equivalent of "guides" in the sister build).
2. **Grid tidy pass** — pack each department's nodes into a uniform near-square
   grid, centred where the force step left that group. This is pure geometry.
3. **Frame** — `fitView` on load (React Flow already does this); optionally frame a
   selected service's cluster.

React Flow ships no layout engine, so add one. The lightest fit is **`d3-force`**
(`npm i d3-force @types/d3-force`). Code below is complete and typed to your
existing `Service` / `Relationship` types.

---

## 3. Drop-in: replace `src/layout.ts`

```ts
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceX,
  forceY,
} from 'd3-force'
import type { Service, Relationship, Dept } from './data'

export interface Pos { x: number; y: number }

// Tune these to your card size and taste.
const NODE_SIZE = 200      // card footprint used for collision (px)
const GROUP_GAP = 48       // extra gap between cells in the tidy grid
const LINK_DISTANCE = 280  // longer = airier
const CHARGE = -1800       // more negative = more spread
const GROUP_PULL = 0.06    // how strongly a node is pulled to its department anchor
const TICKS = 400          // headless iterations to settle

// Spread department anchors evenly on a circle so clusters don't overlap.
function departmentAnchors(depts: Dept[]): Record<string, Pos> {
  const anchors: Record<string, Pos> = {}
  const R = Math.max(600, depts.length * 220)
  depts.forEach((d, i) => {
    const a = (i / depts.length) * Math.PI * 2
    anchors[d] = { x: Math.cos(a) * R, y: Math.sin(a) * R }
  })
  return anchors
}

// Compute a clean layout from the relationships. Returns id -> {x, y}.
export function computeLayout(
  services: Service[],
  relationships: Relationship[],
): Record<string, Pos> {
  type SimNode = { id: string; dept: Dept; x?: number; y?: number }
  const nodes: SimNode[] = services.map((s) => ({ id: s.id, dept: s.dept }))
  const links = relationships.map((r) => ({ source: r.source, target: r.target }))
  const depts = [...new Set(services.map((s) => s.dept))]
  const anchors = departmentAnchors(depts)

  // 1. Force pass (headless): charge + links + collision + a gentle per-department pull.
  const sim = forceSimulation(nodes as any)
    .force('charge', forceManyBody().strength(CHARGE))
    .force(
      'link',
      forceLink(links as any)
        .id((n: any) => n.id)
        .distance(LINK_DISTANCE)
        .strength(0.4),
    )
    .force('collide', forceCollide(NODE_SIZE * 0.6))
    .force('x', forceX((n: any) => anchors[n.dept].x).strength(GROUP_PULL))
    .force('y', forceY((n: any) => anchors[n.dept].y).strength(GROUP_PULL))
    .stop()
  for (let i = 0; i < TICKS; i++) sim.tick()

  // 2. Deterministic tidy pass: pack each department into a uniform grid,
  //    centred where the force step left that group.
  const byDept = new Map<string, SimNode[]>()
  nodes.forEach((n) => {
    const arr = byDept.get(n.dept) ?? []
    arr.push(n)
    byDept.set(n.dept, arr)
  })

  const out: Record<string, Pos> = {}
  const gap = NODE_SIZE + GROUP_GAP
  byDept.forEach((group) => {
    const cx = group.reduce((s, n) => s + (n.x ?? 0), 0) / group.length
    const cy = group.reduce((s, n) => s + (n.y ?? 0), 0) / group.length
    const cols = Math.ceil(Math.sqrt(group.length))
    const rows = Math.ceil(group.length / cols)
    group.forEach((n, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      out[n.id] = {
        x: cx + (col - (cols - 1) / 2) * gap,
        y: cy + (row - (rows - 1) / 2) * gap,
      }
    })
  })
  return out
}
```

Note: the old `positionForNewHub` / `positionForNewSpoke` are no longer needed for
placement. When authoring adds a new service, just re-run `computeLayout`; you can
drop the hand-authored `Service.position` values (or keep them only as a fallback).

---

## 4. Wire it into `EcosystemMap.tsx`

Compute the layout once from the data, then use it for node positions instead of
`service.position`:

```ts
import { computeLayout } from './layout'

// inside MapContent, replacing the layoutCenter/position logic:
const layout = useMemo(
  () => computeLayout(services, relationships),
  [services, relationships],
)

const nodes = useMemo<Node[]>(
  () =>
    services.map((service, index) => ({
      id: service.id,
      type: 'service',
      position: layout[service.id] ?? service.position, // fallback if a node is missing
      data: { service, index },
      selected: service.id === selectedId,
    })),
  [services, layout, selectedId],
)
```

Keep the rest as-is. `fitView` / `fitViewOptions={{ padding: 0.15 }}` already frames
the map on load. You can keep or drop the zoom "fan-out" effect; it's independent
of the new layout. If you keep it, base it on the layout's centre (average of the
computed positions) rather than the authored one.

**Optional: frame a selected cluster.** When `selectedId` is set, call
`reactFlow.fitView({ nodes: [selected + its neighbours], padding: 0.2, duration: 300 })`
so selecting a service zooms to its neighbourhood, mirroring the sister build's
"open centred on the traced service".

---

## 5. Parameter reference (start here, then tune)

| Concern | Value | Effect |
|---|---|---|
| `CHARGE` | -1800 | node repulsion (more negative = more spread) |
| `LINK_DISTANCE` | 280 | resting length of a relationship |
| `forceLink` strength | 0.4 | how hard links pull |
| `forceCollide` radius | NODE_SIZE x 0.6 | stop card overlap |
| `GROUP_PULL` | 0.06 | department clustering strength |
| anchor radius `R` | max(600, depts x 220) | space between department clusters |
| `TICKS` | 400 | headless settle iterations |
| grid | cols = ceil(sqrt(n)), row-major | uniform, near-square groups |
| grid cell gap | NODE_SIZE + 48 | spacing inside a group |

Rules of thumb: clusters overlapping -> raise `R` or `CHARGE`; groups too loose ->
lower the grid gap; departments drifting apart -> raise `GROUP_PULL`; edges too
long/short -> adjust `LINK_DISTANCE`.

---

## 6. Optional refinements (nice, not required)

- **Visible group boxes.** React Flow supports group nodes: add one node per
  department with `type: 'group'`, and give each service node `parentId: <deptId>`
  and `extent: 'parent'`. Size each group box to bound its grid. This draws the
  department containers explicitly (like the guide boxes in the sister build).
  Do the grid tidy in the box's local coordinates.
- **Size by importance.** The sister build sizes each node by how many pages link
  to it (in-degree), so hubs read bigger. Your cards are uniform; if you want the
  same signal, scale the card or add a small badge from
  `relationships.filter(r => r.target === id).length`.
- **Directed edges.** Content links are directional. Add `markerEnd: { type: 'arrowclosed' }`
  to the React Flow edges if you want the direction shown.
- **Two edge kinds.** If you ever distinguish body links from curated "related"
  links, draw related ones dashed and tinted, as the sister build does.
- **Consistent exports.** If you export the board (image/CSV) and support filters,
  compute the export and any legend from the *currently shown* nodes, not the full
  dataset, so map, key and export always agree.

---

## 7. If you'd rather match the sister build exactly

### Cytoscape fCoSE headless

You can skip d3-force and instead run **Cytoscape fCoSE headless** purely to
compute positions, then feed them to React Flow. That reuses the sister build's
exact tuning (`nodeRepulsion: 17000`, `idealEdgeLength: 170`, `nodeSeparation: 240`,
`gravity: 0.06`, `numIter: 3000`, `packComponents: true`, `fit: false`), followed
by the same grid tidy pass. It adds `cytoscape` + `cytoscape-fcose` as
compute-only dependencies (heavier than d3-force), so only do this if you want
identical output; otherwise the d3-force recipe above is lighter and idiomatic for
React Flow.

---

## 8. Keeping the screenshot cards (card sizing)

The layout only computes positions. The screenshot cards (`ServiceNode` +
`Preview` / mShots) are untouched, so the map keeps looking exactly as it does
now, just arranged well. The only thing to get right is **spacing to the real
card size**, because the cards are large and taller than they are wide. In the
drop-in `layout.ts`, set these to match your `.service-node`:

```ts
const CARD_W = 300   // your card width
const CARD_H = 340   // your card height
const GAP_X = 60     // horizontal gap between cards in a group
const GAP_Y = 56     // vertical gap between cards in a group
// collide radius uses Math.max(CARD_W, CARD_H) * 0.55
```

The grid tidy uses `CARD_W + GAP_X` across and `CARD_H + GAP_Y` down, so the
cards never overlap whatever their aspect ratio.

## 9. Drop-in files and how to apply

Two files accompany this spec. They are the canonical implementation and
supersede the inline snippets above.

- `layout.ts` -> replace `src/layout.ts`. It keeps your existing
  `positionForNewHub` / `positionForNewSpoke` (still used by `store.ts`) and adds
  `computeLayout`.
- `EcosystemMap.tsx` -> replace `src/EcosystemMap.tsx`. It computes the layout
  from the data and positions the React Flow nodes from it, keeping your edges,
  the fit-on-load, and the zoom fan-out.

Steps:

1. `npm i d3-force @types/d3-force`
2. Drop the two files in over `src/layout.ts` and `src/EcosystemMap.tsx`.
3. Set `CARD_W` / `CARD_H` / `GAP_X` / `GAP_Y` in `layout.ts` to your card.
4. Run the app. The map auto-arranges: each department a tidy grid, groups
   apart, related links connecting them.

Notes:
- Grouping is by `dept`. To group by GDS/HMCTS or Claimant/Defendant instead,
  change the one-line `groupOf()` in `layout.ts` to return `service.organisation`
  or `service.party`.
- `layout.ts` type-checks under `strict` with `d3-force` v3.
- Positions are recomputed only when `services` / `relationships` change, so the
  map is stable while you pan, zoom, or select.
