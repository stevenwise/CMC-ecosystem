import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { EcosystemMap } from './EcosystemMap'
import { buildDeptStyles, FALLBACK_DEPT_STYLE, type Service } from './data'
import { Preview } from './Preview'
import { useMapData } from './store'
import { Editor } from './Editor'
import { authenticateEdit, isEditAuthenticated } from './auth'

type Route = 'map' | 'edit'

function routeFromHash(): Route {
  return typeof window !== 'undefined' && window.location.hash === '#edit'
    ? 'edit'
    : 'map'
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash)
  const [authed, setAuthed] = useState<boolean>(() => isEditAuthenticated())

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Gate direct URL access to #edit — someone bookmarks or shares the link and
  // lands on it without going through the "Edit" chip.
  useEffect(() => {
    if (route !== 'edit' || authed) return
    if (authenticateEdit()) {
      setAuthed(true)
    } else {
      window.location.hash = ''
    }
  }, [route, authed])

  const handleRequestEdit = () => {
    if (authed) {
      window.location.hash = 'edit'
      return
    }
    if (authenticateEdit()) {
      setAuthed(true)
      window.location.hash = 'edit'
    }
  }

  if (route === 'edit' && authed) {
    return <Editor />
  }

  return <MapView onRequestEdit={handleRequestEdit} />
}

function MapView({ onRequestEdit }: { onRequestEdit: () => void }) {
  const { services, relationships } = useMapData()
  const [selectedId, setSelectedId] = useState<string | null>('ptax')

  const deptStyles = useMemo(() => buildDeptStyles(services.map((s) => s.dept)), [services])
  const selected = services.find((s) => s.id === selectedId) ?? null
  const selectedDept = selected ? (deptStyles[selected.dept] ?? FALLBACK_DEPT_STYLE) : FALLBACK_DEPT_STYLE

  const related = useMemo<Service[]>(() => {
    if (!selected) return []
    const ids = relationships
      .filter((r) => r.source === selected.id || r.target === selected.id)
      .map((r) => (r.source === selected.id ? r.target : r.source))
    return ids
      .map((id) => services.find((s) => s.id === id))
      .filter((s): s is Service => Boolean(s))
  }, [selected, relationships, services])

  return (
    <div className="app">
      <div className="title-chip">
        <span className="title-dot" />
        <div>
          <div className="title-primary">GOV.UK Ecosystem</div>
          <div className="title-secondary">Click a node to explore</div>
        </div>
      </div>
      <button
        type="button"
        className="edit-chip"
        onClick={onRequestEdit}
        aria-label="Edit the ecosystem"
      >
        <span className="edit-chip-dot" /> Edit
      </button>
      <div className="app-body">
        <div className="map-region">
          <div className="map-canvas">
            <EcosystemMap selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </div>
        <aside className="side-panel">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
                className="detail-card"
                style={{
                  ['--dept-color' as string]: selectedDept.color,
                  ['--dept-soft' as string]: selectedDept.soft,
                }}
              >
                <Preview url={selected.url} className="detail-preview" />
                <div className="detail-dept">{selectedDept.label}</div>
                <h2 className="detail-title">{selected.name}</h2>
                <p className="detail-summary">{selected.summary}</p>
                {(selected.organisation || selected.party) && (
                  <dl className="detail-labels">
                    {selected.organisation && (
                      <div className="detail-label detail-label-org">
                        <dt>Organisation</dt>
                        <dd>{selected.organisation}</dd>
                      </div>
                    )}
                    {selected.party && (
                      <div className="detail-label detail-label-party">
                        <dt>Party</dt>
                        <dd>{selected.party}</dd>
                      </div>
                    )}
                  </dl>
                )}
                <a
                  className="detail-link"
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open on GOV.UK
                </a>
                {related.length > 0 && (
                  <div className="detail-related">
                    <div className="detail-related-heading">Connects to</div>
                    <ul>
                      {related.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            className="related-link"
                            onClick={() => setSelectedId(r.id)}
                          >
                            {r.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="side-panel-empty"
              >
                Click any service to see what it does and where it connects.
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  )
}
