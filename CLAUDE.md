# Working agreement — govuk-ecosystem

Terse responses. No trailing summaries. Match scope to what was asked.

This project runs on http://localhost:3001 (port set in `.env`).

## What this is

An interactive, animated ecosystem map of GOV.UK pages. Nodes are services / pages; edges are the relationships between them. Designed to be embedded as a Miro live-embed on a Miro board — but also works as a standalone web app.

## Design direction

Friendly, chilled — think Framer / React docs vibe rather than GDS civic-service. The GOV.UK connection is the *content* (real services, real URLs); the *chrome* is soft and modern.

- 16:9 canvas, letterboxed on a light sky-blue page
- Palette: soft sky-blue surface (`#e6f0fb`), white cards, jewel-tone accents per department (sky, teal, violet, amber, rose)
- Rounded corners (16–24px), soft blue-tinted shadows, no hard 2px borders
- Body text stays black/dark charcoal — no faded greys — but weights soften
- Organic node layout, curved bezier edges, gentle idle floating motion
- No dark masthead — a small floating title chip inside the canvas is enough

## Data

`Dept` is a free-form string, not a closed union — colours are assigned
dynamically in first-seen order by `buildDeptStyles` (`src/data.ts`), not
looked up in a fixed table. This is so the editor's CSV import (pulls
`pages.csv` / `connections.csv` exported from Content Explorer's map view,
manual upload, no live integration between the two apps) can bring in any
number of real GOV.UK owning organisations, not just the original five. The
demo `SERVICES` array keeps its original colours because dept order of first
appearance is unchanged. `src/csv.ts` parses the files, `src/layout.ts`'s
`autoLayout` positions whatever graph comes out of them since CSV rows carry
no x/y.

Real GOV.UK content is densely cross-linked (related links, shared hub pages
like "Find a legal adviser") — plain connected components collapse into one
giant blob the moment anything links across topics, which is the normal
case, not the exception. So `autoLayout` runs community detection first to
find the actual topical sub-groups inside that blob: a single-pass Louvain
(greedy modularity optimisation — each node moves to whichever neighbouring
group gains it the most modularity, repeated to convergence). An earlier
label-propagation version (each node just adopts its most common
neighbour's label) looked fine on a sparse test graph but collapsed into one
dominant label the moment the graph got as densely linked as real content
actually is — modularity gives every move an actual quality score instead
of a popularity contest, so it keeps finding structure label propagation
loses in dense graphs.

Louvain alone still isn't the real grouping signal for a page that's part of
a GOV.UK multi-part guide — pages.csv's `part_of_guide` column already says
exactly which pages belong together (it's the same grouping Content
Explorer's own map draws as a labelled box), so `detectCommunities` takes it
as a `fixedGroups` map: a page with a `part_of_guide` is seeded straight into
its guide's community and excluded from the moving loop entirely, i.e. it can
never end up anywhere else. Everything without one (standalone guides,
forms, shared destinations) stays free and gets placed by modularity as
before. `store.ts`'s `computeGuideGroups` then turns each guide's *actual*
page positions into a bounding box, and `EcosystemMap.tsx` renders those as
background `guide-group` nodes (see `GuideGroupNode.tsx`) — drawn deliberately,
not left to proximity, because a guide's internal link shape can be tree-like
rather than tightly cross-linked (e.g. one hub page linking out to several
single-degree Redirect/form pages), and a force layout spreads a tree into
branches rather than a tight blob. That's the force simulation behaving
correctly, not a bug — the box is what makes the grouping unambiguous
regardless of that shape. `groups` on `MapData` is only ever set by a CSV
import and is dropped on any manual edit (none of the mutation functions
carry it forward), since a hand-edited map no longer strictly matches the
imported group structure.

Each multi-page group then runs through a Fruchterman–Reingold force-directed
simulation (nodes repel, edges act as springs, plus a collision-resolution
pass since a dense hub can still leave a couple of cards touching) for an
organic per-cluster shape, and the resulting clusters are packed left-to-right
into rows sized from their *total area* (not a naive node count, which let
one oversized or elongated cluster blow a naive grid out in one dimension) so
the overall canvas stays close to square. The row gutter has to be at least
the collision-resolution minimum distance, or cards from two adjacent
clusters can end up closer than same-cluster cards ever could. True
singletons (no edges at all) get pulled into their own compact grid rather
than each claiming a full cluster slot. `minZoom` on the map is intentionally
low (0.1) as a safety net so a very large or oddly-shaped import can still
fit fully on screen after fit-to-view rather than being clamped and left
partly unreachable.

## Stack

- Vite + React + TypeScript
- `@xyflow/react` for the graph
- `framer-motion` for entrance/hover motion
- Hand-rolled CSS (no framework) so it stays lightweight in a Miro embed
