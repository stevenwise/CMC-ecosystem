# govuk-ecosystem

Interactive, animated ecosystem map of GOV.UK pages — designed to drop into a Miro board as a live embed, works standalone too.

Runs on http://localhost:3001 — see `.env`.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3001.

## Drop it into Miro

1. Deploy the app to any static host with a public HTTPS URL. Vercel, Netlify or Cloudflare Pages each take a Vite build straight from a git repo.
2. On your Miro board, click the `+` menu → **Embed** → paste the deployed URL.
3. Resize the embed frame so the map has room to breathe.

Miro keeps the iframe interactive, so pan, click and hover all work inside the board. The tradeoff for the live-embed route: collaborators can't drag individual nodes onto the Miro canvas — the map lives inside its embed frame. If that becomes important later, the alternative is a Miro custom app using the Web SDK, which renders as real Miro shapes.

## Import from Content Explorer

The editor (`#edit` → **Edit** chip → ⚙ **Advanced**) can import a CSV exported
from [GOV.UK content explorer](https://github.com/stevenwise/govukcontentexplorer)'s
map view (Estate view → build a map → export `pages.csv` and/or
`connections.csv`). Select one or both files — it's a manual upload, the two
apps don't talk to each other otherwise:

- `pages.csv` alone gives you nodes with no connections between them.
- `connections.csv` alone gives you connections, with minimal stub nodes for
  whatever pages it references.
- Both together (select them at once in the file picker) gives you the full
  picture — matched up by GOV.UK path, which both files key on.

Importing **replaces** the current map (there's a confirm prompt, and
"Download backup" first if you want to keep what's there). Positions aren't in
the CSV, so pages are auto-arranged: any page that's part of a GOV.UK
multi-part guide (the `part_of_guide` column) is drawn inside a labelled box
with the rest of that guide, the same grouping Content Explorer's own map
shows; everything else is clustered by how it links to other pages.
Departments are read from the `owner` column and coloured dynamically — there's
no longer a fixed list of five, so a real export with dozens of GOV.UK
organisations works the same way the built-in demo data does.

## Design

GOV.UK palette and vibe, but a step ahead of where GDS is today. Palette and typography tokens live in `src/index.css`. Nodes and edges are defined in `src/data.ts` — add a new GOV.UK page there and it'll show up on the map, or use the editor's CSV import above.

## Stack

- Vite + React + TypeScript
- `@xyflow/react` for the graph
- `framer-motion` for entrance and hover motion
- Hand-rolled CSS (no framework) to keep the embed lightweight
