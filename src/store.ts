import { useEffect, useState } from 'react'
import {
  RELATIONSHIPS,
  SERVICES,
  type Dept,
  type Organisation,
  type Party,
  type Relationship,
  type Service,
} from './data'
import { autoLayout, positionForNewHub, positionForNewSpoke, type GuideGroup } from './layout'
import { parseCsvTable, type CsvTable } from './csv'

const GOVUK_ORIGIN = 'https://www.gov.uk'
const FALLBACK_DEPT = 'Unknown'

const STORAGE_KEY = 'ecosystem-map:v1'

export type { GuideGroup }

export interface MapData {
  services: Service[]
  relationships: Relationship[]
  // Only ever set by a CSV import (from Content Explorer's `part_of_guide`
  // column) — a bounding box + title per multi-part guide, so the map can
  // draw a labelled box the way Content Explorer's own map does, since a
  // guide's pages don't always settle into an unambiguous visual blob on
  // proximity alone (a tree-shaped link structure spreads out into
  // branches, which is the force layout behaving correctly, not a bug).
  // Dropped on any manual edit — none of the mutations below carry it
  // forward, since a hand-edited map no longer strictly matches the
  // imported group structure.
  groups?: GuideGroup[]
}

export interface ServiceInput {
  name: string
  url: string
  dept: Dept
  summary: string
  organisation: Organisation | ''
  party: Party | ''
}

const listeners = new Set<() => void>()

function loadFromStorage(): MapData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as MapData).services) ||
      !Array.isArray((parsed as MapData).relationships)
    ) {
      return null
    }
    return parsed as MapData
  } catch {
    return null
  }
}

function saveToStorage(data: MapData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // localStorage might be full or unavailable — the running app still works,
    // just no persistence for this session.
  }
}

const DEFAULT_DATA: MapData = { services: SERVICES, relationships: RELATIONSHIPS }

let currentState: MapData = loadFromStorage() ?? DEFAULT_DATA

function commit(next: MapData) {
  currentState = next
  saveToStorage(next)
  listeners.forEach((l) => l())
}

export function useMapData(): MapData {
  const [state, setLocal] = useState(currentState)
  useEffect(() => {
    const listener = () => setLocal(currentState)
    listeners.add(listener)
    // Sync in case the state changed between initial render and effect running.
    listener()
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return state
}

/* ---------- Helpers ---------- */

function slugFromUrl(url: string): string {
  return (
    url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'page'
  )
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '').toLowerCase()
}

function findServiceByUrl(services: Service[], url: string): Service | undefined {
  const normalized = normalizeUrl(url)
  return services.find((s) => normalizeUrl(s.url) === normalized)
}

function uniqueId(base: string, services: Service[]): string {
  if (!services.some((s) => s.id === base)) return base
  let n = 2
  while (services.some((s) => s.id === `${base}-${n}`)) n++
  return `${base}-${n}`
}

function relationshipExists(
  relationships: Relationship[],
  a: string,
  b: string,
): boolean {
  return relationships.some(
    (r) =>
      (r.source === a && r.target === b) || (r.source === b && r.target === a),
  )
}

function hubConnectionCount(relationships: Relationship[], hubId: string): number {
  return relationships.filter((r) => r.source === hubId || r.target === hubId).length
}

function optionalString<T extends string>(value: T | ''): T | undefined {
  return value === '' ? undefined : value
}

function validateInput(input: ServiceInput): string | null {
  if (!input.name.trim()) return 'Name is required'
  if (!input.url.trim()) return 'URL is required'
  if (!/^https?:\/\//i.test(input.url)) return 'URL must start with http:// or https://'
  if (!input.dept.trim()) return 'Department is required'
  return null
}

/* ---------- Mutations ---------- */

export function addMainPage(input: ServiceInput): { ok: true; id: string } | { ok: false; error: string } {
  const err = validateInput(input)
  if (err) return { ok: false, error: err }

  const existing = findServiceByUrl(currentState.services, input.url)
  if (existing) return { ok: true, id: existing.id }

  const id = uniqueId(slugFromUrl(input.url), currentState.services)
  const service: Service = {
    id,
    name: input.name.trim(),
    url: input.url.trim(),
    dept: input.dept,
    summary: input.summary.trim(),
    position: positionForNewHub(currentState.services),
    organisation: optionalString(input.organisation),
    party: optionalString(input.party),
  }
  commit({
    services: [...currentState.services, service],
    relationships: currentState.relationships,
  })
  return { ok: true, id }
}

export function addConnectedPage(
  hubId: string,
  input: ServiceInput,
  label?: string,
): { ok: true; id: string } | { ok: false; error: string } {
  const err = validateInput(input)
  if (err) return { ok: false, error: err }

  const hub = currentState.services.find((s) => s.id === hubId)
  if (!hub) return { ok: false, error: 'Main page not found' }

  let services = currentState.services
  let targetId: string

  const existing = findServiceByUrl(services, input.url)
  if (existing) {
    targetId = existing.id
  } else {
    const id = uniqueId(slugFromUrl(input.url), services)
    const service: Service = {
      id,
      name: input.name.trim(),
      url: input.url.trim(),
      dept: input.dept,
      summary: input.summary.trim(),
      position: positionForNewSpoke(hub, hubConnectionCount(currentState.relationships, hubId)),
      organisation: optionalString(input.organisation),
      party: optionalString(input.party),
    }
    services = [...services, service]
    targetId = id
  }

  if (hubId === targetId) {
    // Same page as hub — just add/keep the service, don't self-link
    commit({ services, relationships: currentState.relationships })
    return { ok: true, id: targetId }
  }

  const relationships = relationshipExists(currentState.relationships, hubId, targetId)
    ? currentState.relationships
    : [
        ...currentState.relationships,
        {
          source: hubId,
          target: targetId,
          label: label && label.trim() ? label.trim() : undefined,
        },
      ]

  commit({ services, relationships })
  return { ok: true, id: targetId }
}

export function updateService(
  id: string,
  input: ServiceInput,
): { ok: true } | { ok: false; error: string } {
  const err = validateInput(input)
  if (err) return { ok: false, error: err }

  const services = currentState.services.map((s) =>
    s.id === id
      ? {
          ...s,
          name: input.name.trim(),
          url: input.url.trim(),
          dept: input.dept,
          summary: input.summary.trim(),
          organisation: optionalString(input.organisation),
          party: optionalString(input.party),
        }
      : s,
  )
  commit({ services, relationships: currentState.relationships })
  return { ok: true }
}

export function removeService(id: string): void {
  commit({
    services: currentState.services.filter((s) => s.id !== id),
    relationships: currentState.relationships.filter(
      (r) => r.source !== id && r.target !== id,
    ),
  })
}

export function removeRelationship(source: string, target: string): void {
  commit({
    services: currentState.services,
    relationships: currentState.relationships.filter(
      (r) =>
        !(
          (r.source === source && r.target === target) ||
          (r.source === target && r.target === source)
        ),
    ),
  })
}

export function resetToDefaults(): void {
  commit(DEFAULT_DATA)
}

/* ---------- Import / Export ---------- */

export function exportJson(): string {
  return JSON.stringify(currentState, null, 2)
}

export function importJson(json: string): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as MapData).services) ||
      !Array.isArray((parsed as MapData).relationships)
    ) {
      return { ok: false, error: 'JSON must have services[] and relationships[]' }
    }
    commit(parsed as MapData)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
  }
}

export function exportAsDataTs(): string {
  const stringify = (v: string) => JSON.stringify(v)
  const services = currentState.services
    .map((s) => {
      const org = s.organisation ? `, organisation: ${stringify(s.organisation)}` : ''
      const party = s.party ? `, party: ${stringify(s.party)}` : ''
      return `  { id: ${stringify(s.id)}, name: ${stringify(s.name)}, dept: ${stringify(
        s.dept,
      )}, url: ${stringify(s.url)}, summary: ${stringify(
        s.summary,
      )}, position: { x: ${Math.round(s.position.x)}, y: ${Math.round(s.position.y)} }${org}${party} },`
    })
    .join('\n')
  const relationships = currentState.relationships
    .map((r) => {
      const label = r.label ? `, label: ${stringify(r.label)}` : ''
      return `  { source: ${stringify(r.source)}, target: ${stringify(r.target)}${label} },`
    })
    .join('\n')
  return `export const SERVICES: Service[] = [\n${services}\n]\n\nexport const RELATIONSHIPS: Relationship[] = [\n${relationships}\n]\n`
}

/* ---------- Import from Content Explorer CSV ---------- */

export interface CsvImportStats {
  pages: number
  connections: number
  skippedConnections: number
}

type CsvFileKind = 'pages' | 'connections'

// Content Explorer's map export (mapExportCsv / mapExportEdgesCsv in its
// app.js) produces pages.csv (title, path, url, owner, …) and
// connections.csv (source_path, target_path, …). Detected by header rather
// than filename, so it doesn't matter what the files get renamed to.
function classifyCsv(text: string): { kind: CsvFileKind; table: CsvTable } | null {
  const table = parseCsvTable(text)
  if (table.header.length === 0) return null
  const has = (col: string) => table.header.includes(col)
  if (has('path') && has('title') && has('url')) return { kind: 'pages', table }
  if (has('source_path') && has('target_path')) return { kind: 'connections', table }
  return null
}

function summaryFromPageRow(row: Record<string, string>): string {
  const parts: string[] = []
  if (row.content_type) parts.push(row.content_type)
  if (row.part_of_guide) parts.push(`part of "${row.part_of_guide}"`)
  if (row.last_updated) parts.push(`updated ${row.last_updated}`)
  return parts.join(' · ')
}

function idFromPageRow(row: Record<string, string>): string {
  return row.path?.trim() || slugFromUrl(row.url)
}

// Builds Service[] + Relationship[] from a Content Explorer CSV export and
// replaces the current map with it. Accepts pages.csv alone (nodes, no
// edges), connections.csv alone (edges, with minimal stub nodes for
// whatever they reference), or both together for the full picture — the
// two are matched up by GOV.UK path, which both files key on.
export function importContentExplorerCsv(
  files: Array<{ name: string; text: string }>,
): { ok: true; stats: CsvImportStats } | { ok: false; error: string } {
  const pageTables: CsvTable[] = []
  const connectionTables: CsvTable[] = []

  for (const file of files) {
    const parsed = classifyCsv(file.text)
    if (!parsed) {
      return {
        ok: false,
        error: `"${file.name}" doesn't look like a Content Explorer export — expected a pages.csv (title, path, url…) or connections.csv (source_path, target_path…).`,
      }
    }
    if (parsed.kind === 'pages') pageTables.push(parsed.table)
    else connectionTables.push(parsed.table)
  }

  if (pageTables.length === 0 && connectionTables.length === 0) {
    return { ok: false, error: 'No CSV files selected.' }
  }

  const services = new Map<string, Service>()
  // `part_of_guide` is the same value GOV.UK's own multi-part guides use to
  // tie their pages together — Content Explorer's map draws each one as a
  // labelled box. It's the most reliable clustering signal available, so
  // autoLayout treats it as authoritative wherever a page has it.
  const partOfGuide = new Map<string, string>()

  for (const table of pageTables) {
    for (const row of table.rows) {
      if (!row.title || !row.url) continue
      const id = idFromPageRow(row)
      if (services.has(id)) continue
      services.set(id, {
        id,
        name: row.title,
        dept: row.owner || FALLBACK_DEPT,
        url: row.url,
        summary: summaryFromPageRow(row),
        position: { x: 0, y: 0 },
      })
      if (row.part_of_guide?.trim()) {
        partOfGuide.set(id, row.part_of_guide.trim())
      }
    }
  }

  const relationships: Relationship[] = []
  let skippedConnections = 0

  for (const table of connectionTables) {
    for (const row of table.rows) {
      const sourcePath = row.source_path
      const targetPath = row.target_path
      if (!sourcePath || !targetPath || sourcePath === targetPath) {
        skippedConnections++
        continue
      }
      // Fill in any node connections.csv references that no pages.csv
      // covered — e.g. connections.csv imported on its own, or a shared
      // destination outside the exported page set.
      if (!services.has(sourcePath) && row.source) {
        services.set(sourcePath, {
          id: sourcePath,
          name: row.source,
          dept: row.source_type || FALLBACK_DEPT,
          url: GOVUK_ORIGIN + sourcePath,
          summary: row.source_type || '',
          position: { x: 0, y: 0 },
        })
      }
      if (!services.has(targetPath) && row.target) {
        services.set(targetPath, {
          id: targetPath,
          name: row.target,
          dept: row.target_type || FALLBACK_DEPT,
          url: GOVUK_ORIGIN + targetPath,
          summary: row.target_type || '',
          position: { x: 0, y: 0 },
        })
      }
      if (!services.has(sourcePath) || !services.has(targetPath)) {
        skippedConnections++
        continue
      }
      relationships.push({
        source: sourcePath,
        target: targetPath,
        label: row.link_kind === 'related' ? 'related' : undefined,
      })
    }
  }

  if (services.size === 0) {
    return { ok: false, error: 'No pages found in the selected file(s).' }
  }

  const serviceList = [...services.values()]
  const { positions, groups } = autoLayout(serviceList, relationships, partOfGuide)
  serviceList.forEach((s) => {
    s.position = positions.get(s.id) ?? { x: 0, y: 0 }
  })

  commit({ services: serviceList, relationships, groups })

  return {
    ok: true,
    stats: { pages: serviceList.length, connections: relationships.length, skippedConnections },
  }
}
