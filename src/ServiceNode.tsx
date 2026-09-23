import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import type { DeptStyle, Service } from './data'
import { Preview } from './Preview'

export type ServiceNodeType = Node<
  { service: Service; index: number; deptStyle: DeptStyle },
  'service'
>

export function ServiceNode({ data, selected }: NodeProps<ServiceNodeType>) {
  const { service, index, deptStyle: dept } = data

  const floatDuration = 4.5 + (index % 4) * 0.6
  const floatDelay = 0.5 + index * 0.12

  return (
    <motion.div
      className={`service-node${selected ? ' is-selected' : ''}`}
      style={{
        ['--dept-color' as string]: dept.color,
        ['--dept-soft' as string]: dept.soft,
      }}
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -3, 0],
      }}
      transition={{
        opacity: { duration: 0.5, delay: index * 0.06 },
        scale: { duration: 0.5, delay: index * 0.06, ease: [0.2, 0.7, 0.2, 1] },
        y: {
          duration: floatDuration,
          delay: floatDelay,
          repeat: Infinity,
          repeatType: 'reverse',
          ease: 'easeInOut',
        },
      }}
      whileHover={{ scale: 1.03 }}
    >
      <Handle type="target" position={Position.Left} className="service-handle" />
      <Preview url={service.url} className="service-preview" />
      <span className="service-dept-pill" title={dept.label}>
        <span className="pill-label">{dept.label}</span>
      </span>
      <span className="service-name">{service.name}</span>
      <Handle type="source" position={Position.Right} className="service-handle" />
    </motion.div>
  )
}
