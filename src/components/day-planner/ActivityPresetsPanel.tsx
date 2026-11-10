import { useState } from 'react'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ActivityPreset, DayPlanState, Subject } from '../../types'
import { importClassActivities } from '../../lib/dayPlannerImport'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { inputClass } from '../ui/Field'
import { ActivityPresetSheet } from './ActivityPresetSheet'
import { createId } from '../../lib/id'

interface ActivityPresetsPanelProps {
  presets: ActivityPreset[]
  dayPlan: DayPlanState
  subjects: Subject[]
  semesterStartDate: string
  weekCount: number
  onTogglePreset: (id: string, selected: boolean) => void
  onUpsertPreset: (preset: ActivityPreset) => void
  onDeletePreset: (id: string) => void
  onUpdateDayPlan: (patch: Partial<DayPlanState> | ((prev: DayPlanState) => DayPlanState)) => void
}

export function ActivityPresetsPanel({
  presets,
  dayPlan,
  subjects,
  semesterStartDate,
  weekCount,
  onTogglePreset,
  onUpsertPreset,
  onDeletePreset,
  onUpdateDayPlan,
}: ActivityPresetsPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ActivityPreset | null>(null)
  const [oneOffName, setOneOffName] = useState('')
  const [oneOffDuration, setOneOffDuration] = useState(30)
  const [oneOffTime, setOneOffTime] = useState('14:00')

  const selected = new Set(dayPlan.selectedPresetIds)
  const allIds = [
    ...presets.map((p) => p.id),
    ...dayPlan.customActivities.map((a) => a.id),
  ]

  const importClasses = () => {
    const imported = importClassActivities(subjects, dayPlan.date, semesterStartDate, weekCount)
    onUpdateDayPlan((prev) => {
      const existing = new Set(prev.customActivities.map((a) => a.id))
      const added = imported.filter((a) => !existing.has(a.id))
      if (!added.length) return prev
      return { ...prev, customActivities: [...prev.customActivities, ...added] }
    })
  }

  const addOneOff = () => {
    const name = oneOffName.trim()
    if (!name) return
    const activity: ActivityPreset = {
      id: createId(),
      name,
      durationMinutes: Math.max(5, oneOffDuration),
      anchor: { type: 'fixed', time: oneOffTime || '14:00' },
      isDefault: false,
      color: 'rose',
    }
    onUpdateDayPlan((prev) => ({
      ...prev,
      customActivities: [...prev.customActivities, activity],
    }))
    setOneOffName('')
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">Activities</h2>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus className="size-4" />}
          onClick={() => {
            setEditing(null)
            setSheetOpen(true)
          }}
        >
          Preset
        </Button>
      </div>

      <ul className="flex flex-col gap-1">
        {presets.map((preset) => (
          <li key={preset.id} className="flex min-h-11 items-center gap-2 rounded-xl px-1">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm text-zinc-800">
              <input
                type="checkbox"
                className="size-4 rounded border-zinc-300"
                checked={selected.has(preset.id)}
                onChange={(e) => onTogglePreset(preset.id, e.target.checked)}
              />
              <span className="min-w-0 truncate">
                <span className="font-medium">{preset.name}</span>
                <span className="text-zinc-400">
                  {' '}
                  · {preset.durationMinutes}m · {preset.anchor.type}
                </span>
              </span>
            </label>
            <IconButton
              label="Edit preset"
              className="size-9"
              onClick={() => {
                setEditing(preset)
                setSheetOpen(true)
              }}
            >
              <Pencil className="size-3.5" />
            </IconButton>
            <IconButton label="Delete preset" className="size-9" onClick={() => onDeletePreset(preset.id)}>
              <Trash2 className="size-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>

      {dayPlan.customActivities.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-zinc-100 pt-3">
          <p className="text-xs font-medium text-zinc-500">Today only</p>
          {dayPlan.customActivities.map((activity) => (
            <div key={activity.id} className="flex min-h-11 items-center gap-2 rounded-xl px-1">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">
                <span className="font-medium">{activity.name}</span>
                <span className="text-zinc-400">
                  {' '}
                  · {activity.durationMinutes}m
                  {activity.anchor.type === 'fixed' ? ` @ ${activity.anchor.time}` : ''}
                </span>
              </span>
              <IconButton
                label="Remove"
                className="size-9"
                onClick={() =>
                  onUpdateDayPlan((prev) => ({
                    ...prev,
                    customActivities: prev.customActivities.filter((a) => a.id !== activity.id),
                  }))
                }
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <p className="text-xs font-medium text-zinc-500">One-off activity</p>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <input
            className={inputClass}
            placeholder="Name"
            value={oneOffName}
            onChange={(e) => setOneOffName(e.target.value)}
          />
          <input
            className={`${inputClass} w-20`}
            type="number"
            min={5}
            step={5}
            value={oneOffDuration}
            onChange={(e) => setOneOffDuration(Number(e.target.value) || 5)}
            aria-label="Duration minutes"
          />
          <input
            className={`${inputClass} w-28`}
            type="time"
            value={oneOffTime}
            onChange={(e) => setOneOffTime(e.target.value)}
            aria-label="Start time"
          />
        </div>
        <Button size="sm" disabled={!oneOffName.trim()} onClick={addOneOff}>
          Add one-off
        </Button>
      </div>

      <Button
        variant="secondary"
        icon={<Download className="size-4" />}
        onClick={importClasses}
      >
        Import today's classes
      </Button>

      <ActivityPresetSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={editing}
        activityIds={allIds}
        onSave={onUpsertPreset}
      />
    </section>
  )
}
