import { useMemo, useRef, useState, type FormEvent } from 'react'
import { EcosystemMap } from './EcosystemMap'
import {
  buildDeptStyles,
  FALLBACK_DEPT_STYLE,
  ORGANISATIONS,
  PARTIES,
  type DeptStyle,
  type Organisation,
  type Party,
  type Service,
} from './data'
import {
  addConnectedPage,
  addMainPage,
  exportAsDataTs,
  exportJson,
  importContentExplorerCsv,
  importJson,
  removeRelationship,
  removeService,
  resetToDefaults,
  updateService,
  useMapData,
  type ServiceInput,
} from './store'

const EMPTY_INPUT: ServiceInput = {
  name: '',
  url: '',
  dept: '',
  summary: '',
  organisation: '',
  party: '',
}

export function Editor() {
  const { services, relationships } = useMapData()
  const deptStyles = useMemo(() => buildDeptStyles(services.map((s) => s.dept)), [services])
  const knownDepts = useMemo(
    () => Object.keys(deptStyles).sort((a, b) => a.localeCompare(b)),
    [deptStyles],
  )
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const importFileRef = useRef<HTMLInputElement | null>(null)
  const csvImportRef = useRef<HTMLInputElement | null>(null)

  function flash(kind: 'ok' | 'error', text: string) {
    setStatus({ kind, text })
    window.setTimeout(() => setStatus(null), 2500)
  }

  function handleExportJson() {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ecosystem-map.json'
    a.click()
    URL.revokeObjectURL(url)
    flash('ok', 'Backup downloaded')
  }

  function handleImportJson(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const outcome = importJson(result)
      if (outcome.ok) flash('ok', 'Backup loaded')
      else flash('error', outcome.error)
    }
    reader.readAsText(file)
  }

  function handleImportCsvFiles(fileList: FileList) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    if (
      !window.confirm(
        `Import from Content Explorer and replace the current map with what's in ${
          files.length === 1 ? 'this file' : 'these files'
        }? This can't be undone — use "Download backup" first if you want to keep what's here.`,
      )
    ) {
      return
    }
    Promise.all(files.map((file) => file.text().then((text) => ({ name: file.name, text }))))
      .then((parsedFiles) => {
        const outcome = importContentExplorerCsv(parsedFiles)
        if (outcome.ok) {
          const { pages, connections, skippedConnections } = outcome.stats
          const skippedNote = skippedConnections > 0 ? `, skipped ${skippedConnections}` : ''
          flash('ok', `Imported ${pages} pages and ${connections} connections${skippedNote}`)
          setExpandedId(null)
        } else {
          flash('error', outcome.error)
        }
      })
      .catch(() => flash('error', 'Could not read the selected file(s)'))
  }

  async function handleCopyAsDataTs() {
    try {
      await navigator.clipboard.writeText(exportAsDataTs())
      flash('ok', 'Copied — paste into src/data.ts')
    } catch {
      flash('error', 'Could not copy — try again')
    }
  }

  function handleReset() {
    if (!window.confirm('Discard your changes and restore the original set of pages?')) return
    resetToDefaults()
    setExpandedId(null)
    flash('ok', 'Restored the original set')
  }

  function handleSaveAndClose() {
    // Changes are already applied to the map via auto-save on every edit.
    // This button is the explicit "commit" moment and returns to the map view.
    window.location.hash = ''
  }

  return (
    <div className="editor">
      <datalist id="dept-options">
        {knownDepts.map((dept) => (
          <option key={dept} value={dept} />
        ))}
      </datalist>
      <header className="editor-header">
        <a href="#" className="back-chip" aria-label="Back to map">
          ← Back to map
        </a>
        <div className="editor-title-block">
          <h1>Ecosystem editor</h1>
          <p>
            Add main pages and their connections, or import a CSV exported from Content
            Explorer's map view. Changes save as you type.
          </p>
        </div>
        {status && (
          <div className={`editor-status editor-status-${status.kind}`}>
            {status.text}
          </div>
        )}
        <div className="editor-advanced">
          <button
            type="button"
            className="editor-advanced-toggle"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            aria-label="Advanced options"
            title="Advanced"
          >
            <span aria-hidden="true">⚙</span>
          </button>
          {advancedOpen && (
            <div className="editor-advanced-menu" role="menu">
              <button
                type="button"
                onClick={() => csvImportRef.current?.click()}
                title="Import pages.csv and/or connections.csv exported from Content Explorer's map view"
              >
                Import from Content Explorer (CSV)
              </button>
              <button type="button" onClick={handleExportJson}>
                Download backup
              </button>
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
              >
                Load backup
              </button>
              <button
                type="button"
                onClick={handleCopyAsDataTs}
                title="For pasting into src/data.ts in the repo"
              >
                Copy as data.ts
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="editor-body">
        <section className="editor-authoring">
          <div className="editor-panel">
            <h2 className="editor-panel-title">Add a main page</h2>
            <AddPageForm
              submitLabel="Add page"
              onSubmit={(input) => {
                const result = addMainPage(input)
                if (result.ok) {
                  setExpandedId(result.id)
                  return { ok: true }
                }
                return { ok: false, error: result.error }
              }}
            />
          </div>

          <div className="editor-panel">
            <h2 className="editor-panel-title">
              Pages{' '}
              <span className="editor-panel-count">({services.length})</span>
            </h2>
            {services.length === 0 ? (
              <p className="editor-empty">No pages yet — add one above.</p>
            ) : (
              <ul className="page-list">
                {services.map((service) => (
                  <li key={service.id}>
                    <PageRow
                      service={service}
                      services={services}
                      relationships={relationships}
                      deptStyles={deptStyles}
                      expanded={expandedId === service.id}
                      onToggle={() =>
                        setExpandedId(expandedId === service.id ? null : service.id)
                      }
                      onSelect={setExpandedId}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="editor-preview" aria-label="Live map preview">
          <div className="editor-preview-inner">
            <EcosystemMap
              selectedId={null}
              onSelect={() => undefined}
              interactive={false}
            />
          </div>
        </aside>
      </div>

      <footer className="editor-actions">
        <div className="editor-actions-spacer" />
        <button type="button" onClick={handleReset} className="danger">
          Reset to original
        </button>
        <button type="button" onClick={handleSaveAndClose} className="primary">
          Save to the map →
        </button>
        <input
          ref={importFileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleImportJson(file)
            e.target.value = ''
          }}
        />
        <input
          ref={csvImportRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleImportCsvFiles(e.target.files)
            }
            e.target.value = ''
          }}
        />
      </footer>
    </div>
  )
}

/* ---------- Sub-components ---------- */

interface PageRowProps {
  service: Service
  services: Service[]
  relationships: Array<{ source: string; target: string; label?: string }>
  deptStyles: Record<string, DeptStyle>
  expanded: boolean
  onToggle: () => void
  onSelect: (id: string) => void
}

function PageRow({
  service,
  services,
  relationships,
  deptStyles,
  expanded,
  onToggle,
  onSelect,
}: PageRowProps) {
  const [editing, setEditing] = useState(false)
  const dept = deptStyles[service.dept] ?? FALLBACK_DEPT_STYLE

  const connections = useMemo(() => {
    return relationships
      .filter((r) => r.source === service.id || r.target === service.id)
      .map((r) => {
        const otherId = r.source === service.id ? r.target : r.source
        const other = services.find((s) => s.id === otherId)
        return { edge: r, other }
      })
      .filter((c): c is { edge: (typeof relationships)[number]; other: Service } =>
        Boolean(c.other),
      )
  }, [relationships, service.id, services])

  function handleDeletePage() {
    if (!window.confirm(`Delete "${service.name}" and all its connections?`)) return
    removeService(service.id)
  }

  return (
    <div className={`page-row${expanded ? ' is-expanded' : ''}`}>
      <div className="page-row-head">
        <button
          type="button"
          className="page-row-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="page-row-caret" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
          <span
            className="dept-pill"
            title={dept.label}
            style={{
              ['--dept-color' as string]: dept.color,
              ['--dept-soft' as string]: dept.soft,
            }}
          >
            <span className="pill-label">{dept.label}</span>
          </span>
          <span className="page-row-name">{service.name}</span>
          <span className="page-row-count">
            {connections.length} connection{connections.length === 1 ? '' : 's'}
          </span>
        </button>
        <button
          type="button"
          className="page-row-delete"
          onClick={handleDeletePage}
          aria-label={`Delete ${service.name}`}
        >
          Delete
        </button>
      </div>

      {expanded && (
        <div className="page-row-body">
          {editing ? (
            <AddPageForm
              submitLabel="Save changes"
              cancelLabel="Cancel"
              initial={{
                name: service.name,
                url: service.url,
                dept: service.dept,
                summary: service.summary,
                organisation: service.organisation ?? '',
                party: service.party ?? '',
              }}
              onSubmit={(input) => {
                const result = updateService(service.id, input)
                if (result.ok) {
                  setEditing(false)
                  return { ok: true }
                }
                return { ok: false, error: result.error }
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="page-row-meta">
              <a
                href={service.url}
                target="_blank"
                rel="noreferrer"
                className="page-row-url"
              >
                {service.url}
              </a>
              {service.summary && (
                <p className="page-row-summary">{service.summary}</p>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => setEditing(true)}
              >
                Edit page details
              </button>
            </div>
          )}

          <div className="page-row-section">
            <h3 className="page-row-section-title">Connections</h3>
            {connections.length === 0 ? (
              <p className="editor-empty">No connections yet.</p>
            ) : (
              <ul className="connection-list">
                {connections.map(({ edge, other }) => {
                  const otherDept = deptStyles[other.dept] ?? FALLBACK_DEPT_STYLE
                  return (
                    <li key={`${edge.source}-${edge.target}`}>
                      <button
                        type="button"
                        className="connection-link"
                        onClick={() => onSelect(other.id)}
                      >
                        <span
                          className="dept-pill dept-pill-sm"
                          title={otherDept.label}
                          style={{
                            ['--dept-color' as string]: otherDept.color,
                            ['--dept-soft' as string]: otherDept.soft,
                          }}
                        >
                          <span className="pill-label">{otherDept.label}</span>
                        </span>
                        <span className="connection-name">{other.name}</span>
                        {edge.label && (
                          <span className="connection-label">{edge.label}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="text-button danger"
                        onClick={() =>
                          removeRelationship(edge.source, edge.target)
                        }
                      >
                        Remove
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="page-row-section">
            <h3 className="page-row-section-title">Add a connected page</h3>
            <AddPageForm
              submitLabel="Add connection"
              includeLabelField
              onSubmit={(input, label) => {
                const result = addConnectedPage(service.id, input, label)
                if (result.ok) return { ok: true }
                return { ok: false, error: result.error }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

interface AddPageFormProps {
  submitLabel: string
  cancelLabel?: string
  initial?: ServiceInput
  includeLabelField?: boolean
  onSubmit: (
    input: ServiceInput,
    label?: string,
  ) => { ok: true } | { ok: false; error: string }
  onCancel?: () => void
}

function AddPageForm({
  submitLabel,
  cancelLabel,
  initial,
  includeLabelField,
  onSubmit,
  onCancel,
}: AddPageFormProps) {
  const [input, setInput] = useState<ServiceInput>(initial ?? EMPTY_INPUT)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const result = onSubmit(input, includeLabelField ? label : undefined)
    if (result.ok) {
      setError(null)
      if (!initial) {
        setInput(EMPTY_INPUT)
        setLabel('')
      }
    } else {
      setError(result.error)
    }
  }

  return (
    <form className="page-form" onSubmit={handleSubmit}>
      <div className="page-form-row">
        <label className="page-form-field">
          <span>Name</span>
          <input
            type="text"
            value={input.name}
            onChange={(e) => setInput({ ...input, name: e.target.value })}
            placeholder="e.g. Apply for a Blue Badge"
            required
          />
        </label>
        <label className="page-form-field page-form-field-dept">
          <span>Department</span>
          <input
            type="text"
            list="dept-options"
            value={input.dept}
            onChange={(e) => setInput({ ...input, dept: e.target.value })}
            placeholder="e.g. HM Revenue & Customs"
            required
          />
        </label>
      </div>
      <label className="page-form-field">
        <span>URL</span>
        <input
          type="url"
          value={input.url}
          onChange={(e) => setInput({ ...input, url: e.target.value })}
          placeholder="https://www.gov.uk/..."
          required
        />
      </label>
      <label className="page-form-field">
        <span>Summary</span>
        <textarea
          value={input.summary}
          onChange={(e) => setInput({ ...input, summary: e.target.value })}
          placeholder="One sentence explaining what the service does."
          rows={2}
        />
      </label>
      <div className="page-form-row">
        <label className="page-form-field">
          <span>Organisation</span>
          <select
            value={input.organisation}
            onChange={(e) =>
              setInput({
                ...input,
                organisation: e.target.value as Organisation | '',
              })
            }
          >
            <option value="">— none —</option>
            {ORGANISATIONS.map((org) => (
              <option key={org} value={org}>
                {org}
              </option>
            ))}
          </select>
        </label>
        <label className="page-form-field">
          <span>Party</span>
          <select
            value={input.party}
            onChange={(e) =>
              setInput({
                ...input,
                party: e.target.value as Party | '',
              })
            }
          >
            <option value="">— none —</option>
            {PARTIES.map((party) => (
              <option key={party} value={party}>
                {party}
              </option>
            ))}
          </select>
        </label>
      </div>
      {includeLabelField && (
        <label className="page-form-field">
          <span>Connection label (optional)</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. tax code, address, ID"
          />
        </label>
      )}
      {error && <div className="page-form-error">{error}</div>}
      <div className="page-form-actions">
        <button type="submit" className="primary">
          {submitLabel}
        </button>
        {onCancel && cancelLabel && (
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
      </div>
    </form>
  )
}
