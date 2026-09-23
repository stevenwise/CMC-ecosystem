import type { Node, NodeProps } from '@xyflow/react'

export type GuideGroupNodeType = Node<{ label: string }, 'guide-group'>

// A background box + title behind a multi-part guide's cards — mirrors how
// Content Explorer's own map draws each guide as a labelled box. It's drawn
// this way, not left to proximity alone, because a guide's internal link
// shape (tree vs. tightly cross-linked) can spread its cards out in ways
// that don't read as an obvious blob even though the grouping itself is
// correct — see autoLayout's community detection in layout.ts.
export function GuideGroupNode({ data }: NodeProps<GuideGroupNodeType>) {
  return (
    <div className="guide-group-box">
      <span className="guide-group-label">{data.label}</span>
    </div>
  )
}
