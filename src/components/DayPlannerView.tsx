import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { usePlanner } from '../hooks/usePlannerStore'
import { currentWeek, toISODate } from '../lib/semester'
import type { PlannedTodoItem } from '../types'
import { Field } from './ui/Field'
import { Sheet } from './ui/Sheet'
import { TodoPicker } from './day-planner/TodoPicker'
import { ActivityPresetsPanel } from './day-planner/ActivityPresetsPanel'
import { Timeline } from './day-planner/Timeline'
import { cn } from '../lib/cn'

/** One automatic reset per calendar day, so a date picked in Configure survives tab changes. */
let dailyResetFor = ''
const CLEAR_HOLD_MS = 1200

function LongPressClearButton({ onConfirm }: { onConfirm: () => void }) {
  const timerRef = useRef<number | null>(null)
  const helperTimerRef = useRef<number | null>(null)
  const [holding, setHolding] = useState(false)
  const [showHelper, setShowHelper] = useState(false)

  const stop = (showHint = true) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    if (holding && showHint) {
      setShowHelper(true)
      if (helperTimerRef.current !== null) window.clearTimeout(helperTimerRef.current)
      helperTimerRef.current = window.setTimeout(() => setShowHelper(false), 1400)
    }
    setHolding(false)
  }

  const start = () => {
    if (timerRef.current !== null) return
    setShowHelper(false)
    setHolding(true)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setHolding(false)
      onConfirm()
    }, CLEAR_HOLD_MS)
  }

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    if (helperTimerRef.current !== null) window.clearTimeout(helperTimerRef.current)
  }, [])

  const beginPointerHold = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    start()
  }

  return (
    <button
      type="button"
      aria-label="Hold for 1.2 seconds to clear day"
      className={cn(
        'relative isolate flex h-11 w-full touch-none items-center justify-center overflow-hidden rounded-xl',
        'border border-red-200 bg-white px-4 text-sm font-medium text-red-600 select-none',
        'transition-colors duration-150 ease-out hover:bg-red-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600',
      )}
      onClick={(event) => event.preventDefault()}
      onPointerDown={beginPointerHold}
      onPointerUp={() => stop()}
      onPointerLeave={() => stop()}
      onPointerCancel={() => stop()}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault()
          start()
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') stop()
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 -z-10 bg-red-500/25 dark:bg-red-500/35',
          holding
            ? 'w-full transition-[width] duration-[1200ms] ease-linear'
            : 'w-0 transition-[width] duration-150 ease-out',
        )}
      />
      {showHelper ? 'Hold to clear day' : 'Clear day / fresh day'}
    </button>
  )
}

export function DayPlannerView() {
  const {
    data,
    subjects,
    settings,
    updateDayPlan,
    resetDayPlan,
    upsertActivityPreset,
    deleteActivityPreset,
    setProgress,
    switchStudy,
  } = usePlanner()

  const { dayPlan, activityPresets, studySessions } = data
  const defaultWeek = currentWeek(settings.semesterStartDate, settings.weekCount)
  const [isEditing, setIsEditing] = useState(false)
  const [configureOpen, setConfigureOpen] = useState(false)

  useEffect(() => {
    const today = toISODate(new Date())
    if (dailyResetFor === today) return
    dailyResetFor = today
    if (dayPlan.date !== today) resetDayPlan(today)
  }, [dayPlan.date, resetDayPlan])

  const togglePreset = (id: string, selected: boolean) => {
    updateDayPlan((prev) => {
      const set = new Set(prev.selectedPresetIds)
      if (selected) set.add(id)
      else set.delete(id)
      const selectedPresetIds = [...set]
      return {
        ...prev,
        selectedPresetIds,
        settingsBaselineSelectedPresetIds: selectedPresetIds,
        settingsBaselineCustomActivities: prev.customActivities,
        settingsBaselineActivityOverrides: prev.settingsBaselineActivityOverrides,
      }
    })
  }

  const updateActivitySettings = (
    patch: Partial<typeof dayPlan> | ((prev: typeof dayPlan) => typeof dayPlan),
  ) => {
    updateDayPlan((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      const activeIds = new Set([
        ...next.selectedPresetIds,
        ...next.customActivities.map((activity) => activity.id),
      ])
      const settingsBaselineActivityOverrides = Object.fromEntries(
        [...activeIds].flatMap((id) => {
          const previous = prev.settingsBaselineActivityOverrides?.[id]
          const configuredAnchor = next.activityOverrides?.[id]?.anchor
          const configured = {
            ...previous,
            ...(configuredAnchor ? { anchor: configuredAnchor } : {}),
          }
          return Object.keys(configured).length > 0 ? [[id, configured]] : []
        }),
      )
      return {
        ...next,
        settingsBaselineSelectedPresetIds: [...next.selectedPresetIds],
        settingsBaselineCustomActivities: next.customActivities.map((activity) => ({
          ...activity,
          anchor: { ...activity.anchor },
        })),
        settingsBaselineActivityOverrides:
          Object.keys(settingsBaselineActivityOverrides).length > 0
            ? settingsBaselineActivityOverrides
            : undefined,
      }
    })
  }

  const toggleTodoComplete = (item: PlannedTodoItem, completed: boolean) => {
    for (const category of item.categories) {
      setProgress(item.subjectId, item.week, category, completed ? 'completed' : 'pending')
    }
  }

  const revertToSettings = () => {
    updateDayPlan((prev) => {
      const byId = new Map(prev.todoQueue.map((todo) => [todo.id, todo]))
      const baselineTodos = prev.settingsBaselineOrder
        .map((id) => byId.get(id))
        .filter((todo): todo is PlannedTodoItem => todo !== undefined)
      const baselineIds = new Set(prev.settingsBaselineOrder)
      const ordered = [...baselineTodos, ...prev.todoQueue.filter((todo) => !baselineIds.has(todo.id))]
      return {
        ...prev,
        selectedPresetIds: [...prev.settingsBaselineSelectedPresetIds],
        customActivities: prev.settingsBaselineCustomActivities.map((activity) => ({
          ...activity,
          anchor: { ...activity.anchor },
        })),
        todoQueue: ordered.map(({
          customDurationMinutes: _customDurationMinutes,
          snappedStartMinute: _snappedStartMinute,
          snappedEndMinute: _snappedEndMinute,
          ...todo
        }) => todo),
        breakOverrides: undefined,
        activityOverrides: prev.settingsBaselineActivityOverrides,
      }
    })
  }

  const clearDay = () => {
    updateDayPlan((prev) => ({
      date: prev.date,
      dayStartTime: prev.dayStartTime,
      minBreakTailMinutes: prev.minBreakTailMinutes ?? 30,
      selectedPresetIds: activityPresets.filter((preset) => preset.isDefault).map((preset) => preset.id),
      customActivities: [],
      todoQueue: [],
      settingsBaselineOrder: [],
      settingsBaselineSelectedPresetIds: activityPresets.filter((preset) => preset.isDefault).map((preset) => preset.id),
      settingsBaselineCustomActivities: [],
      settingsBaselineActivityOverrides: undefined,
    }))
    setConfigureOpen(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Timeline
        dayPlan={dayPlan}
        presets={activityPresets}
        sessions={studySessions}
        subjects={subjects}
        isEditing={isEditing}
        onToggleEditing={() => setIsEditing((value) => !value)}
        onResetEdits={revertToSettings}
        onConfigure={() => setConfigureOpen(true)}
        onCommitDayPlan={updateDayPlan}
        onToggleTodoComplete={toggleTodoComplete}
        onStartStudy={(item) => switchStudy(item.subjectId, item.week, item.categories)}
      />

      <Sheet
        open={configureOpen}
        onClose={() => setConfigureOpen(false)}
        title="Configure"
        subtitle="Date, todos, and activities"
        width="lg"
        footer={
          <LongPressClearButton onConfirm={clearDay} />
        }
      >
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Date"
              type="date"
              value={dayPlan.date}
              onChange={(event) => updateDayPlan({ date: event.target.value || toISODate(new Date()) })}
            />
            <Field
              label="Day start"
              type="time"
              value={dayPlan.dayStartTime}
              onChange={(event) => updateDayPlan({ dayStartTime: event.target.value || '08:00' })}
            />
            <Field
              label="Min work left for break (min)"
              type="number"
              min={0}
              step={5}
              value={dayPlan.minBreakTailMinutes ?? 30}
              onChange={(event) =>
                updateDayPlan({
                  minBreakTailMinutes: Math.max(0, Math.round(Number(event.target.value) || 0)),
                })
              }
            />
          </div>

          <div className="border-t border-zinc-100 pt-6">
            <TodoPicker
              subjects={subjects}
              weekCount={settings.weekCount}
              defaultWeek={defaultWeek}
              date={dayPlan.date}
              sessions={studySessions}
              todoQueue={dayPlan.todoQueue}
              activityTargets={[
                ...activityPresets
                  .filter((preset) => dayPlan.selectedPresetIds.includes(preset.id))
                  .map((preset) => ({ id: preset.id, label: preset.name })),
                ...dayPlan.customActivities.map((activity) => ({ id: activity.id, label: activity.name })),
              ]}
              onChange={(todoQueue) => updateDayPlan({
                todoQueue,
                settingsBaselineOrder: todoQueue.map((todo) => todo.id),
              })}
            />
          </div>

          <div className="border-t border-zinc-100 pt-6">
            <ActivityPresetsPanel
              presets={activityPresets}
              dayPlan={dayPlan}
              subjects={subjects}
              semesterStartDate={settings.semesterStartDate}
              weekCount={settings.weekCount}
              onTogglePreset={togglePreset}
              onUpsertPreset={upsertActivityPreset}
              onDeletePreset={deleteActivityPreset}
              onUpdateDayPlan={updateActivitySettings}
            />
          </div>
        </div>
      </Sheet>
    </div>
  )
}
