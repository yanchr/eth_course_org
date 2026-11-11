import { useState } from 'react'
import { Download, Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import type { ActivityPreset, BlockAnchor, DayPlanState, Subject } from '../../types'
import { importClassActivities } from '../../lib/dayPlannerImport'
import { todoLabel } from '../../lib/dayPlannerMath'
import { createId } from '../../lib/id'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { inputClass } from '../ui/Field'
import { ActivityPresetSheet } from './ActivityPresetSheet'
import { BlockAnchorEditor, type AnchorTarget } from './BlockAnchorEditor'

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

const cardClass =
  'rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/40'
const badgeClass =
  'inline-flex min-h-8 items-center rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-600 transition-colors duration-150 ease-out hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300'

function anchorLabel(anchor: BlockAnchor, targets: AnchorTarget[]): string {
  if (anchor.type === 'fixed') return anchor.time
  if (anchor.type === 'before' || anchor.type === 'after') {
    const target = targets.find((item) => item.id === anchor.targetId)?.label ?? anchor.targetId
    return `${anchor.type === 'before' ? 'Before' : 'After'} ${target}`
  }
  return anchor.type[0].toUpperCase() + anchor.type.slice(1)
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [oneOffName, setOneOffName] = useState('')
  const [oneOffDuration, setOneOffDuration] = useState(30)
  const [oneOffTime, setOneOffTime] = useState('14:00')
  const [oneOffAnchor, setOneOffAnchor] = useState<BlockAnchor>({ type: 'fixed', time: '14:00' })

  const selected = new Set(dayPlan.selectedPresetIds)
  const anchorTargets: AnchorTarget[] = [
    ...presets
      .filter((preset) => selected.has(preset.id))
      .map((preset) => ({ id: preset.id, label: preset.name })),
    ...dayPlan.customActivities.map((activity) => ({ id: activity.id, label: activity.name })),
    ...dayPlan.todoQueue.map((todo) => ({
      id: todo.id,
      label: `${subjects.find((subject) => subject.id === todo.subjectId)?.name ?? 'Subject'} · ${todoLabel(todo.categories)}`,
    })),
  ]
  const activeAnchors = [
    ...presets
      .filter((preset) => selected.has(preset.id))
      .map((preset) => dayPlan.activityOverrides?.[preset.id]?.anchor ?? preset.anchor),
    ...dayPlan.customActivities.map((activity) => activity.anchor),
  ]
  const anchorCount = (type: 'start' | 'end') =>
    activeAnchors.filter((anchor) => anchor.type === type).length
  const shouldShowPriority = (anchor: BlockAnchor) =>
    (anchor.type !== 'start' && anchor.type !== 'end') || anchorCount(anchor.type) >= 2

  const importClasses = () => {
    const imported = importClassActivities(subjects, dayPlan.date, semesterStartDate, weekCount)
    onUpdateDayPlan((prev) => {
      const existing = new Set(prev.customActivities.map((activity) => activity.id))
      const added = imported.filter((activity) => !existing.has(activity.id))
      return added.length
        ? { ...prev, customActivities: [...prev.customActivities, ...added] }
        : prev
    })
  }

  const addOneOff = () => {
    const name = oneOffName.trim()
    if (!name) return
    const activity: ActivityPreset = {
      id: createId(),
      name,
      durationMinutes: Math.max(5, oneOffDuration),
      anchor: oneOffAnchor.type === 'fixed'
        ? { type: 'fixed', time: oneOffTime || oneOffAnchor.time }
        : oneOffAnchor,
      isDefault: false,
      color: 'rose',
    }
    onUpdateDayPlan((prev) => ({
      ...prev,
      customActivities: [...prev.customActivities, activity],
    }))
    setOneOffName('')
    setOneOffAnchor({ type: 'fixed', time: oneOffTime || '14:00' })
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-black">Activities</h2>
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

      <ul className="flex flex-col gap-2">
        {presets.map((preset) => {
          const isSelected = selected.has(preset.id)
          const anchor = dayPlan.activityOverrides?.[preset.id]?.anchor ?? preset.anchor
          const expanded = expandedId === preset.id
          return (
            <li key={preset.id} className={cardClass}>
              <div className="flex min-h-11 items-center gap-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 rounded border-zinc-300"
                    checked={isSelected}
                    onChange={(event) => onTogglePreset(preset.id, event.target.checked)}
                  />
                  <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {preset.name}
                  </span>
                </label>
                <span className={cn(badgeClass, 'pointer-events-none')}>{preset.durationMinutes}m</span>
                <button
                  type="button"
                  className={badgeClass}
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : preset.id)}
                >
                  {anchorLabel(anchor, anchorTargets)}
                </button>
                <IconButton
                  label="Edit activity anchor"
                  className="size-9 shrink-0"
                  onClick={() => setExpandedId(expanded ? null : preset.id)}
                >
                  <Pencil className="size-3.5" />
                </IconButton>
                <IconButton
                  label="Delete preset"
                  className="size-9 shrink-0"
                  onClick={() => onDeletePreset(preset.id)}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
              {expanded && (
                <div className="mt-2 border-t border-zinc-200/70 pt-3 dark:border-zinc-800">
                  {isSelected ? (
                    <BlockAnchorEditor
                      compact
                      value={anchor}
                      targets={anchorTargets.filter((target) => target.id !== preset.id)}
                      showPriority={shouldShowPriority(anchor)}
                      onChange={(nextAnchor) => onUpdateDayPlan((prev) => ({
                        ...prev,
                        activityOverrides: {
                          ...prev.activityOverrides,
                          [preset.id]: {
                            ...prev.activityOverrides?.[preset.id],
                            anchor: nextAnchor,
                          },
                        },
                      }))}
                    />
                  ) : (
                    <p className="text-xs text-zinc-500">Select this activity to configure its day anchor.</p>
                  )}
                  <button
                    type="button"
                    className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                    onClick={() => {
                      setEditing(preset)
                      setSheetOpen(true)
                    }}
                  >
                    <Settings2 className="size-3.5" />
                    Edit preset details
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {dayPlan.customActivities.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
          <p className="text-xs font-medium text-zinc-500">Today only</p>
          {dayPlan.customActivities.map((activity) => {
            const expanded = expandedId === activity.id
            return (
              <div key={activity.id} className={cardClass}>
                <div className="flex min-h-11 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {activity.name}
                  </span>
                  <span className={cn(badgeClass, 'pointer-events-none')}>{activity.durationMinutes}m</span>
                  <button
                    type="button"
                    className={badgeClass}
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? null : activity.id)}
                  >
                    {anchorLabel(activity.anchor, anchorTargets)}
                  </button>
                  <IconButton
                    label="Edit activity anchor"
                    className="size-9 shrink-0"
                    onClick={() => setExpandedId(expanded ? null : activity.id)}
                  >
                    <Pencil className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label="Remove"
                    className="size-9 shrink-0"
                    onClick={() => onUpdateDayPlan((prev) => ({
                      ...prev,
                      customActivities: prev.customActivities.filter((item) => item.id !== activity.id),
                    }))}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
                {expanded && (
                  <div className="mt-2 border-t border-zinc-200/70 pt-3 dark:border-zinc-800">
                    <BlockAnchorEditor
                      compact
                      value={activity.anchor}
                      targets={anchorTargets.filter((target) => target.id !== activity.id)}
                      showPriority={shouldShowPriority(activity.anchor)}
                      onChange={(anchor) => onUpdateDayPlan((prev) => ({
                        ...prev,
                        customActivities: prev.customActivities.map((item) =>
                          item.id === activity.id ? { ...item, anchor } : item
                        ),
                      }))}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <p className="text-xs font-medium text-zinc-500">One-off activity</p>
        <div className="grid grid-cols-[minmax(0,1fr)_72px_104px] items-center gap-2">
          <input
            className={cn(inputClass, 'h-10 min-w-0 rounded-lg')}
            placeholder="Name"
            aria-label="Activity name"
            value={oneOffName}
            onChange={(event) => setOneOffName(event.target.value)}
          />
          <input
            className={cn(inputClass, 'h-10 min-w-0 rounded-lg px-2')}
            type="number"
            min={5}
            step={5}
            placeholder="Min"
            value={oneOffDuration}
            onChange={(event) => setOneOffDuration(Number(event.target.value) || 5)}
            aria-label="Minutes"
          />
          <input
            className={cn(
              inputClass,
              'flex h-10 w-full min-w-0 appearance-none items-center rounded-lg px-2 leading-none',
            )}
            type="time"
            value={oneOffTime}
            onChange={(event) => {
              setOneOffTime(event.target.value)
              if (oneOffAnchor.type === 'fixed') {
                setOneOffAnchor({ type: 'fixed', time: event.target.value })
              }
            }}
            aria-label="Time"
          />
        </div>
        <BlockAnchorEditor
          value={oneOffAnchor}
          targets={anchorTargets}
          hideFixedTime
          showPriority={shouldShowPriority(oneOffAnchor)}
          onChange={(anchor) => {
            setOneOffAnchor(anchor)
            if (anchor.type === 'fixed') setOneOffTime(anchor.time)
          }}
        />
        <Button size="sm" disabled={!oneOffName.trim()} onClick={addOneOff}>
          Add one-off
        </Button>
      </div>

      <Button variant="secondary" icon={<Download className="size-4" />} onClick={importClasses}>
        Import today's classes
      </Button>

      <ActivityPresetSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={editing}
        anchorTargets={anchorTargets}
        onSave={onUpsertPreset}
      />
    </section>
  )
}
