import { useEffect, useState } from 'react'
import { usePlanner } from '../hooks/usePlannerStore'
import { currentWeek, toISODate } from '../lib/semester'
import type { PlannedTodoItem } from '../types'
import { Button } from './ui/Button'
import { Field } from './ui/Field'
import { Sheet } from './ui/Sheet'
import { TodoPicker } from './day-planner/TodoPicker'
import { ActivityPresetsPanel } from './day-planner/ActivityPresetsPanel'
import { Timeline } from './day-planner/Timeline'

/** One automatic reset per calendar day, so a date picked in Configure survives tab changes. */
let dailyResetFor = ''

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
          <Button variant="danger" className="w-full" onClick={clearDay}>
            Clear day / fresh day
          </Button>
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
          </div>

          <div className="border-t border-zinc-100 pt-6">
            <TodoPicker
              subjects={subjects}
              weekCount={settings.weekCount}
              defaultWeek={defaultWeek}
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
