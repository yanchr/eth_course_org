import { useEffect, useState } from 'react'
import type { ActivityAnchor, ActivityColor, ActivityPreset } from '../../types'
import { createId } from '../../lib/id'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'
import { Pill } from '../ui/Pill'

const COLORS: ActivityColor[] = ['amber', 'sky', 'violet', 'rose', 'zinc']
const ANCHOR_TYPES: ActivityAnchor['type'][] = ['fixed', 'start', 'end', 'after']

interface ActivityPresetSheetProps {
  open: boolean
  onClose: () => void
  initial?: ActivityPreset | null
  activityIds: string[]
  onSave: (preset: ActivityPreset) => void
}

function emptyDraft(initial?: ActivityPreset | null): ActivityPreset {
  if (initial) return { ...initial, anchor: { ...initial.anchor } }
  return {
    id: createId(),
    name: '',
    durationMinutes: 30,
    anchor: { type: 'fixed', time: '12:00' },
    isDefault: false,
    color: 'zinc',
  }
}

export function ActivityPresetSheet({
  open,
  onClose,
  initial,
  activityIds,
  onSave,
}: ActivityPresetSheetProps) {
  const [draft, setDraft] = useState(() => emptyDraft(initial))

  useEffect(() => {
    if (open) setDraft(emptyDraft(initial))
  }, [open, initial])

  const setAnchorType = (type: ActivityAnchor['type']) => {
    setDraft((prev) => {
      if (type === 'fixed') return { ...prev, anchor: { type: 'fixed', time: '12:00' } }
      if (type === 'after') {
        const activityId = activityIds.find((id) => id !== prev.id) ?? ''
        return { ...prev, anchor: { type: 'after', activityId } }
      }
      return { ...prev, anchor: { type, priority: 0 } }
    })
  }

  const canSave =
    draft.name.trim() !== '' &&
    draft.durationMinutes > 0 &&
    (draft.anchor.type !== 'after' || draft.anchor.activityId !== '')

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? 'Edit activity' : 'New activity'}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!canSave}
            onClick={() => {
              onSave({ ...draft, name: draft.name.trim() })
              onClose()
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Name"
          value={draft.name}
          onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
          placeholder="Lunch"
          data-autofocus
        />
        <Field
          label="Duration (minutes)"
          type="number"
          min={5}
          step={5}
          value={draft.durationMinutes}
          onChange={(e) =>
            setDraft((p) => ({ ...p, durationMinutes: Math.max(5, Number(e.target.value) || 5) }))
          }
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-500">Anchor</span>
          <div className="flex flex-wrap gap-2">
            {ANCHOR_TYPES.map((type) => (
              <Pill key={type} active={draft.anchor.type === type} onClick={() => setAnchorType(type)}>
                {type}
              </Pill>
            ))}
          </div>
        </div>

        {draft.anchor.type === 'fixed' && (
          <Field
            label="Start time"
            type="time"
            value={draft.anchor.time}
            onChange={(e) => setDraft((p) => ({ ...p, anchor: { type: 'fixed', time: e.target.value } }))}
          />
        )}
        {(draft.anchor.type === 'start' || draft.anchor.type === 'end') && (
          <Field
            label="Priority"
            type="number"
            value={draft.anchor.priority}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                anchor: { type: draft.anchor.type as 'start' | 'end', priority: Number(e.target.value) || 0 },
              }))
            }
          />
        )}
        {draft.anchor.type === 'after' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-500" htmlFor="after-activity">
              After activity
            </label>
            <select
              id="after-activity"
              className={inputClass}
              value={draft.anchor.activityId}
              onChange={(e) =>
                setDraft((p) => ({ ...p, anchor: { type: 'after', activityId: e.target.value } }))
              }
            >
              <option value="">Select…</option>
              {activityIds
                .filter((id) => id !== draft.id)
                .map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-500">Color</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((color) => (
              <Pill
                key={color}
                active={draft.color === color}
                onClick={() => setDraft((p) => ({ ...p, color }))}
              >
                {color}
              </Pill>
            ))}
          </div>
        </div>

        <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="size-4 rounded border-zinc-300"
            checked={draft.isDefault}
            onChange={(e) => setDraft((p) => ({ ...p, isDefault: e.target.checked }))}
          />
          Auto-select on new day
        </label>
      </div>
    </Sheet>
  )
}
