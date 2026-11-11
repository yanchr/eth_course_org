import { useEffect, useState } from 'react'
import type { ActivityColor, ActivityPreset } from '../../types'
import { createId } from '../../lib/id'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Pill } from '../ui/Pill'
import { BlockAnchorEditor, type AnchorTarget } from './BlockAnchorEditor'

const COLORS: ActivityColor[] = ['amber', 'sky', 'violet', 'rose', 'zinc']
interface ActivityPresetSheetProps {
  open: boolean
  onClose: () => void
  initial?: ActivityPreset | null
  anchorTargets: AnchorTarget[]
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
  anchorTargets,
  onSave,
}: ActivityPresetSheetProps) {
  const [draft, setDraft] = useState(() => emptyDraft(initial))

  useEffect(() => {
    if (open) setDraft(emptyDraft(initial))
  }, [open, initial])

  const canSave =
    draft.name.trim() !== '' &&
    draft.durationMinutes > 0 &&
    ((draft.anchor.type !== 'after' && draft.anchor.type !== 'before') || draft.anchor.targetId !== '')

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
          <BlockAnchorEditor
            value={draft.anchor}
            targets={anchorTargets.filter((target) => target.id !== draft.id)}
            onChange={(anchor) => setDraft((prev) => ({ ...prev, anchor }))}
          />
        </div>

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
