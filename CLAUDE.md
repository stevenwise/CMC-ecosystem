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
`autoLayout` positions whatever graph comes out of them (BFS rings from the
highest-degree node per connected component) since CSV rows carry no x/y.

## Stack

- Vite + React + TypeScript
- `@xyflow/react` for the graph
- `framer-motion` for entrance/hover motion
- Hand-rolled CSS (no framework) so it stays lightweight in a Miro embed
