import type { BlockAnchor } from '../../types'
import { inputClass } from '../ui/Field'

export interface AnchorTarget {
  id: string
  label: string
}

const TYPES: { type: BlockAnchor['type']; label: string }[] = [
  { type: 'flow', label: 'Flow' },
  { type: 'start', label: 'Start' },
  { type: 'fixed', label: 'Fixed time' },
  { type: 'before', label: 'Before…' },
  { type: 'after', label: 'After…' },
  { type: 'end', label: 'End' },
]

function anchorFor(type: BlockAnchor['type'], targets: AnchorTarget[]): BlockAnchor {
  if (type === 'flow') return { type: 'flow' }
  if (type === 'fixed') return { type: 'fixed', time: '12:00' }
  if (type === 'before' || type === 'after') return { type, targetId: targets[0]?.id ?? '' }
  return { type, priority: 0 }
}

export function BlockAnchorEditor({
  value,
  targets,
  onChange,
  compact = false,
}: {
  value: BlockAnchor
  targets: AnchorTarget[]
  onChange: (anchor: BlockAnchor) => void
  compact?: boolean
}) {
  return (
    <div className={compact ? 'grid grid-cols-2 gap-1.5' : 'flex flex-col gap-2'}>
      <select
        aria-label="Anchor type"
        className={inputClass}
        value={value.type}
        onChange={(event) => onChange(anchorFor(event.target.value as BlockAnchor['type'], targets))}
      >
        {TYPES.map(({ type, label }) => <option key={type} value={type}>{label}</option>)}
      </select>
      {value.type === 'fixed' && (
        <input
          aria-label="Fixed start time"
          className={inputClass}
          type="time"
          value={value.time}
          onChange={(event) => onChange({ type: 'fixed', time: event.target.value })}
        />
      )}
      {(value.type === 'start' || value.type === 'end') && (
        <input
          aria-label="Anchor priority"
          className={inputClass}
          type="number"
          value={value.priority}
          onChange={(event) => onChange({ type: value.type, priority: Number(event.target.value) || 0 })}
        />
      )}
      {(value.type === 'before' || value.type === 'after') && (
        <select
          aria-label={`${value.type} block`}
          className={inputClass}
          value={value.targetId}
          onChange={(event) => onChange({ type: value.type, targetId: event.target.value })}
        >
          <option value="">Select block…</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>{target.label}</option>
          ))}
          {value.targetId && !targets.some((target) => target.id === value.targetId) && (
              <option value={value.targetId}>{value.targetId}</option>
            )}
        </select>
      )}
    </div>
  )
}
