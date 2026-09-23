import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMapData } from './store'
import { ServiceNode } from './ServiceNode'
import { computeLayout } from './layout'
import { buildDeptStyles, FALLBACK_DEPT_STYLE } from './data'

const nodeTypes = { service: ServiceNode }

// How much extra outward spread per unit of zoom above 1.0. Gentle so nodes never
// spread far past the initial fit — just enough to feel like Google-Maps clustering easing.
const FAN_STRENGTH = 0.12

interface EcosystemMapProps {
  selectedId: string | null
  onSelect: (id: string | null) => void
  interactive?: boolean
}

function MapContent({ selectedId, onSelect, interactive = true }: EcosystemMapProps) {
  const { services, relationships } = useMapData()
  const deptStyles = useMemo(() => buildDeptStyles(services.map((s) => s.dept)), [services])

  // Automatic layout: a force pass clusters each group, then a deterministic grid
  // tidy per group. Recomputes only when the data changes, so it stays stable
  // across other re-renders (selection, zoom, etc.).
  const layout = useMemo(
    () => computeLayout(services, relationships),
    [services, relationships],
  )

  // Layout centre — origin of the zoom-driven fan-out effect. Based on the
  // computed positions (not the authored ones).
  const layoutCenter = useMemo(() => {
    const ids = Object.keys(layout)
    if (ids.length === 0) return { x: 0, y: 0 }
    const xs = ids.map((id) => layout[id].x)
    const ys = ids.map((id) => layout[id].y)
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    }
  }, [layout])

  // Reactive to viewport zoom — nodes fan outward from layoutCenter as you zoom in.
  const zoom = useStore((state) => state.transform[2])

  // Refit whenever the layout changes (add / remove a page) so the map re-frames.
  const reactFlow = useReactFlow()
  useEffect(() => {
    if (services.length === 0) return
    const id = window.setTimeout(() => {
      reactFlow.fitView({ padding: 0.15, duration: 300 })
    }, 20)
    return () => window.clearTimeout(id)
  }, [layout, services.length, reactFlow])

  const nodes = useMemo<Node[]>(() => {
    const fan = Math.max(0, zoom - 1) * FAN_STRENGTH
    const scale = 1 + fan
    return services.map((service, index) => {
      const base = layout[service.id] ?? service.position // fallback if missing
      return {
        id: service.id,
        type: 'service',
        position: {
          x: layoutCenter.x + (base.x - layoutCenter.x) * scale,
          y: layoutCenter.y + (base.y - layoutCenter.y) * scale,
        },
        data: { service, index, deptStyle: deptStyles[service.dept] ?? FALLBACK_DEPT_STYLE },
        selected: service.id === selectedId,
      }
    })
  }, [zoom, selectedId, services, layout, layoutCenter, deptStyles])

  const edges = useMemo<Edge[]>(
    () =>
      relationships.map((relationship, index) => {
        const highlighted =
          selectedId !== null &&
          (relationship.source === selectedId || relationship.target === selectedId)
        return {
          id: `edge-${index}`,
          source: relationship.source,
          target: relationship.target,
          type: 'default',
          label: relationship.label,
          style: {
            stroke: highlighted ? '#4f46e5' : '#a8b8d6',
            strokeWidth: highlighted ? 2 : 1.5,
            opacity: selectedId && !highlighted ? 0.35 : 1,
            transition: 'stroke 0.2s, opacity 0.2s, stroke-width 0.2s',
          },
          labelStyle: {
            fill: highlighted ? '#4f46e5' : '#64748b',
            fontWeight: 500,
            fontSize: 11,
          },
          labelBgStyle: {
            fill: '#ffffff',
            fillOpacity: 0.95,
          },
          labelBgPadding: [8, 4] as [number, number],
          labelBgBorderRadius: 8,
        }
      }),
    [selectedId, relationships],
  )

  const handleNodeClick = useCallback(
    (_: unknown, node: Node) => onSelect(node.id),
    [onSelect],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={interactive ? handleNodeClick : undefined}
      onPaneClick={interactive ? () => onSelect(null) : undefined}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.3}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={interactive}
      panOnDrag={interactive}
      zoomOnScroll={interactive}
      zoomOnPinch={interactive}
      zoomOnDoubleClick={interactive}
      proOptions={{ hideAttribution: true }}
    >
      {interactive && <Controls showInteractive={false} position="bottom-right" />}
    </ReactFlow>
  )
}

export function EcosystemMap(props: EcosystemMapProps) {
  return (
    <ReactFlowProvider>
      <MapContent {...props} />
    </ReactFlowProvider>
  )
}
