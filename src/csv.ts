// Minimal RFC4180-ish CSV parser — handles quoted fields with embedded
// commas, quotes ("" escapes) and newlines, matching the escaping Content
// Explorer's map export uses (its csvCell helper in app.js).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const len = text.length

  while (i < len) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }
    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (char === '\r') {
      i++
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += char
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0))
}

export interface CsvTable {
  header: string[]
  rows: Record<string, string>[]
}

export function parseCsvTable(text: string): CsvTable {
  const raw = parseCsv(text)
  if (raw.length === 0) return { header: [], rows: [] }
  const header = raw[0].map((h) => h.trim())
  const rows = raw.slice(1).map((cells) => {
    const record: Record<string, string> = {}
    header.forEach((key, i) => {
      record[key] = (cells[i] ?? '').trim()
    })
    return record
  })
  return { header, rows }
}
