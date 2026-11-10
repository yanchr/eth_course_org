import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Check, GripVertical, Lock, Play, RotateCcw, SlidersHorizontal, Unlock } from 'lucide-react'
import type {
  ActivityPreset,
  DayPlanState,
  PlannedTodoItem,
  StudySession,
  Subject,
} from '../../types'
import { cn } from '../../lib/cn'
import { getProgress } from '../../lib/progress'
import { formatMinutes, parseTimeRange, toISODate } from '../../lib/semester'
import { useNow } from '../../hooks/useNow'
import { todoTargetMinutes } from '../../lib/dayPlannerMath'
import {
  DAY_END_MINUTES,
  formatBlockRange,
  scheduleDayPlan,
  withDayPlanDraft,
  type TimelineBlock,
} from '../../lib/dayPlannerScheduler'

/** Matches the schedule grid: one hour is a fixed row, blocks scale with duration. */
const HOUR_PX = 96
const PX_PER_MIN = HOUR_PX / 60
const GUTTER = '3.25rem'
const SNAP = 5
const HOURS = Array.from({ length: 24 }, (_, hour) => hour * 60)
const GRID_HEIGHT = 24 * HOUR_PX

type DragState =
  | {
      mode: 'reorder'
      todoId: string
      startY: number
      fromIndex: number
      hoverIndex: number
    }
  | {
      mode: 'shift-time'
      activityId: string
      startY: number
      baseMinutes: number
      currentMinutes: number
    }
  | {
      mode: 'resize'
      target: 'todo' | 'activity' | 'break'
      id: string
      startY: number
      baseDuration: number
      currentDuration: number
    }

interface TimelineProps {
  dayPlan: DayPlanState
  presets: ActivityPreset[]
  sessions: StudySession[]
  subjects: Subject[]
  isEditing: boolean
  onToggleEditing: () => void
  onResetEdits: () => void
  onConfigure: () => void
  onCommitDayPlan: (patch: Partial<DayPlanState> | ((prev: DayPlanState) => DayPlanState)) => void
  onToggleTodoComplete: (item: PlannedTodoItem, completed: boolean) => void
  onStartStudy: (item: PlannedTodoItem) => void
}

type LaidOut = TimelineBlock & { lane: number; lanes: number }
type TodoBlock = Extract<TimelineBlock, { kind: 'todo' }>

const ACTIVITY_TINT: Record<string, string> = {
  amber: 'border-amber-200 bg-amber-50/80',
  sky: 'border-sky-200 bg-sky-50/80',
  violet: 'border-violet-200 bg-violet-50/70',
  rose: 'border-rose-200 bg-rose-50/80',
  zinc: 'border-zinc-200 bg-zinc-50',
}

const ACTIVITY_ACCENT: Record<string, string> = {
  amber: 'bg-amber-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  rose: 'bg-rose-400',
  zinc: 'bg-zinc-300',
}

function snapMinutes(value: number): number {
  return Math.max(SNAP, Math.round(value / SNAP) * SNAP)
}

function snapTime(value: number): number {
  return Math.max(0, Math.min(DAY_END_MINUTES - SNAP, Math.round(value / SNAP) * SNAP))
}

function minutesToHHMM(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function blockBox(start: number, end: number): { top: number; height: number } {
  const top = (start / 60) * HOUR_PX + 1
  const height = Math.max(((end - start) / 60) * HOUR_PX - 2, 14)
  return { top, height }
}

function layoutBlocks(blocks: TimelineBlock[]): LaidOut[] {
  const items: LaidOut[] = blocks.map((block) => ({ ...block, lane: 0, lanes: 1 }))
  items.sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id))

  const result: LaidOut[] = []
  let cluster: LaidOut[] = []
  let clusterEnd = -1

  const flush = () => {
    if (!cluster.length) return
    const laneEnds: number[] = []
    for (const event of cluster) {
      let lane = laneEnds.findIndex((end) => end <= event.start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(event.end)
      } else {
        laneEnds[lane] = event.end
      }
      event.lane = lane
    }
    const lanes = laneEnds.length
    for (const event of cluster) event.lanes = lanes
    result.push(...cluster)
    cluster = []
  }

  for (const event of items) {
    if (cluster.length && event.start >= clusterEnd) flush()
    cluster.push(event)
    clusterEnd = Math.max(clusterEnd, event.end)
  }
  flush()
  return result
}

function todoSubtitle(block: TodoBlock): string {
  const breaks = block.breakMinutes > 0 ? ` (+${block.breakMinutes}m break)` : ''
  return `${formatBlockRange(block.start, block.end)} · ${block.workMinutes}m work${breaks}`
}

export function Timeline({
  dayPlan,
  presets,
  sessions,
  subjects,
  isEditing,
  onToggleEditing,
  onResetEdits,
  onConfigure,
  onCommitDayPlan,
  onToggleTodoComplete,
  onStartStudy,
}: TimelineProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag

  const isToday = dayPlan.date === toISODate(new Date())
  const nowMs = useNow(isToday, 60_000)
  const nowDate = new Date(nowMs)
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes()

  useEffect(() => {
    if (!isEditing) setDrag(null)
  }, [isEditing])

  const dayStartMin = parseTimeRange(dayPlan.dayStartTime)?.start ?? 8 * 60

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = (Math.max(0, dayStartMin - 30) / 60) * HOUR_PX
  }, [dayStartMin])

  const draftPlan = useMemo(() => {
    if (!drag) return dayPlan
    if (drag.mode === 'reorder') {
      const queue = [...dayPlan.todoQueue]
      const from = queue.findIndex((todo) => todo.id === drag.todoId)
      if (from < 0) return dayPlan
      const [item] = queue.splice(from, 1)
      queue.splice(drag.hoverIndex, 0, item)
      return withDayPlanDraft(dayPlan, { todoQueue: queue })
    }
    if (drag.mode === 'shift-time') {
      return withDayPlanDraft(dayPlan, {
        activityOverrides: {
          ...dayPlan.activityOverrides,
          [drag.activityId]: {
            ...dayPlan.activityOverrides?.[drag.activityId],
            time: minutesToHHMM(drag.currentMinutes),
          },
        },
      })
    }
    if (drag.target === 'break') {
      return withDayPlanDraft(dayPlan, {
        breakOverrides: { ...dayPlan.breakOverrides, [drag.id]: drag.currentDuration },
      })
    }
    if (drag.target === 'activity') {
      return withDayPlanDraft(dayPlan, {
        activityOverrides: {
          ...dayPlan.activityOverrides,
          [drag.id]: {
            ...dayPlan.activityOverrides?.[drag.id],
            durationMinutes: drag.currentDuration,
          },
        },
      })
    }
    return withDayPlanDraft(dayPlan, {
      todoQueue: dayPlan.todoQueue.map((todo) =>
        todo.id === drag.id ? { ...todo, customDurationMinutes: drag.currentDuration } : todo,
      ),
    })
  }, [dayPlan, drag])

  const { blocks, doneAt } = useMemo(
    () => scheduleDayPlan(draftPlan, presets, sessions),
    [draftPlan, presets, sessions],
  )
  const laidOut = useMemo(() => layoutBlocks(blocks), [blocks])
  const endsAt = blocks.reduce((max, block) => Math.max(max, block.end), doneAt)

  const commitDrag = () => {
    const current = dragRef.current
    if (!current) return
    if (current.mode === 'reorder') {
      const queue = [...dayPlan.todoQueue]
      const from = queue.findIndex((todo) => todo.id === current.todoId)
      if (from >= 0) {
        const [item] = queue.splice(from, 1)
        queue.splice(current.hoverIndex, 0, item)
        onCommitDayPlan({ todoQueue: queue })
      }
    } else if (current.mode === 'shift-time') {
      onCommitDayPlan((prev) => ({
        ...prev,
        activityOverrides: {
          ...prev.activityOverrides,
          [current.activityId]: {
            ...prev.activityOverrides?.[current.activityId],
            time: minutesToHHMM(current.currentMinutes),
          },
        },
      }))
    } else if (current.target === 'break') {
      onCommitDayPlan((prev) => ({
        ...prev,
        breakOverrides: { ...prev.breakOverrides, [current.id]: current.currentDuration },
      }))
    } else if (current.target === 'activity') {
      onCommitDayPlan((prev) => ({
        ...prev,
        activityOverrides: {
          ...prev.activityOverrides,
          [current.id]: {
            ...prev.activityOverrides?.[current.id],
            durationMinutes: current.currentDuration,
          },
        },
      }))
    } else {
      onCommitDayPlan((prev) => ({
        ...prev,
        todoQueue: prev.todoQueue.map((todo) =>
          todo.id === current.id ? { ...todo, customDurationMinutes: current.currentDuration } : todo,
        ),
      }))
    }
    setDrag(null)
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const current = dragRef.current
    if (!current) return
    const dy = event.clientY - current.startY
    if (current.mode === 'reorder') {
      const delta = Math.round(dy / 64)
      setDrag({
        ...current,
        hoverIndex: Math.max(0, Math.min(dayPlan.todoQueue.length - 1, current.fromIndex + delta)),
      })
    } else if (current.mode === 'shift-time') {
      setDrag({ ...current, currentMinutes: snapTime(current.baseMinutes + dy / PX_PER_MIN) })
    } else {
      setDrag({ ...current, currentDuration: snapMinutes(current.baseDuration + dy / PX_PER_MIN) })
    }
  }

  const bindCapture = (event: ReactPointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveTodo = (todoId: string, dir: -1 | 1) => {
    const queue = [...dayPlan.todoQueue]
    const from = queue.findIndex((todo) => todo.id === todoId)
    const to = from + dir
    if (from < 0 || to < 0 || to >= queue.length) return
    ;[queue[from], queue[to]] = [queue[to], queue[from]]
    onCommitDayPlan({ todoQueue: queue })
  }

  const nudgeResize = (target: 'todo' | 'activity' | 'break', id: string, currentDuration: number, dir: -1 | 1) => {
    const next = snapMinutes(currentDuration + dir * SNAP)
    if (target === 'break') {
      onCommitDayPlan((prev) => ({ ...prev, breakOverrides: { ...prev.breakOverrides, [id]: next } }))
    } else if (target === 'activity') {
      onCommitDayPlan((prev) => ({
        ...prev,
        activityOverrides: {
          ...prev.activityOverrides,
          [id]: { ...prev.activityOverrides?.[id], durationMinutes: next },
        },
      }))
    } else {
      onCommitDayPlan((prev) => ({
        ...prev,
        todoQueue: prev.todoQueue.map((todo) => (todo.id === id ? { ...todo, customDurationMinutes: next } : todo)),
      }))
    }
  }

  const nudgeActivityTime = (activityId: string, startMin: number, dir: -1 | 1) => {
    const next = snapTime(startMin + dir * SNAP)
    onCommitDayPlan((prev) => ({
      ...prev,
      activityOverrides: {
        ...prev.activityOverrides,
        [activityId]: { ...prev.activityOverrides?.[activityId], time: minutesToHHMM(next) },
      },
    }))
  }

  const liveBadge =
    drag?.mode === 'resize'
      ? `${drag.currentDuration}m`
      : drag?.mode === 'shift-time'
        ? formatMinutes(drag.currentMinutes)
        : null

  const showNow = isToday && nowMin >= 0 && nowMin <= DAY_END_MINUTES

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-2 py-1.5">
        <p className="tabular min-w-0 flex-1 truncate px-1 text-xs font-medium text-zinc-600">
          Start {dayPlan.dayStartTime} · Ends {formatMinutes(Math.min(endsAt, DAY_END_MINUTES))}
          {liveBadge && <span className="text-zinc-900"> · {liveBadge}</span>}
        </p>
        <button
          type="button"
          aria-pressed={isEditing}
          aria-label={isEditing ? 'Lock plan' : 'Edit plan'}
          title={isEditing ? 'Lock plan' : 'Edit plan'}
          onClick={onToggleEditing}
          className={cn(
            'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium',
            'transition-colors duration-150 ease-out',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900',
            isEditing ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100',
          )}
        >
          {isEditing ? <Lock className="size-4" /> : <Unlock className="size-4" />}
          <span className="hidden min-[380px]:inline">{isEditing ? 'Lock' : 'Edit'}</span>
        </button>
        <button
          type="button"
          aria-label="Reset edits"
          title="Reset edits"
          onClick={onResetEdits}
          className={cn(
            'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-zinc-600',
            'transition-colors duration-150 ease-out hover:bg-zinc-100 hover:text-zinc-900',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900',
          )}
        >
          <RotateCcw className="size-4" />
          <span className="hidden sm:inline">Reset edits</span>
        </button>
        <button
          type="button"
          aria-label="Configure"
          title="Configure"
          onClick={onConfigure}
          className={cn(
            'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-zinc-600',
            'transition-colors duration-150 ease-out hover:bg-zinc-100 hover:text-zinc-900',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900',
          )}
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Configure</span>
        </button>
      </div>

      <div
        ref={scrollerRef}
        tabIndex={0}
        role="region"
        aria-label="Day timeline from 00:00 to 23:59"
        className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900"
      >
        <div className="flex" style={{ height: GRID_HEIGHT }}>
          <div className="relative shrink-0 border-r border-zinc-100 bg-white" style={{ width: GUTTER }}>
            {HOURS.map((hour, index) => (
              <span
                key={hour}
                className={cn(
                  'tabular absolute right-2 text-[11px] text-zinc-400',
                  index === 0 ? 'translate-y-0.5' : '-translate-y-1/2',
                )}
                style={{ top: index === 0 ? 2 : (hour / 60) * HOUR_PX }}
              >
                {formatMinutes(hour)}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            {HOURS.map((hour, index) =>
              index === 0 ? null : (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-zinc-100"
                  style={{ top: (hour / 60) * HOUR_PX }}
                />
              ),
            )}
            {HOURS.map((hour) => (
              <div
                key={`${hour}-half`}
                className="absolute inset-x-0 border-t border-dashed border-zinc-100/80"
                style={{ top: ((hour + 30) / 60) * HOUR_PX }}
              />
            ))}
            {laidOut.map((block) =>
              block.kind === 'break' ? (
                <OrphanBreak
                  key={block.id}
                  block={block}
                  isEditing={isEditing}
                  isDragging={drag?.mode === 'resize' && drag.target === 'break' && drag.id === block.breakKey}
                  onPointerMove={onPointerMove}
                  onPointerUp={commitDrag}
                  onStartResize={(event) => {
                    if (!isEditing) return
                    bindCapture(event)
                    setDrag({
                      mode: 'resize',
                      target: 'break',
                      id: block.breakKey,
                      startY: event.clientY,
                      baseDuration: block.end - block.start,
                      currentDuration: block.end - block.start,
                    })
                  }}
                  onNudge={(dir) => nudgeResize('break', block.breakKey, block.end - block.start, dir)}
                />
              ) : (
                <PlanBlock
                  key={block.id}
                  block={block}
                  dayPlan={dayPlan}
                  sessions={sessions}
                  subjects={subjects}
                  isEditing={isEditing}
                  drag={drag}
                  onPointerMove={onPointerMove}
                  onPointerUp={commitDrag}
                  onToggleComplete={onToggleTodoComplete}
                  onStartStudy={onStartStudy}
                  onStartReorder={(todoId, event) => {
                    if (!isEditing) return
                    const fromIndex = dayPlan.todoQueue.findIndex((todo) => todo.id === todoId)
                    if (fromIndex < 0) return
                    bindCapture(event)
                    setDrag({ mode: 'reorder', todoId, startY: event.clientY, fromIndex, hoverIndex: fromIndex })
                  }}
                  onStartShift={(activityId, startMin, event) => {
                    if (!isEditing) return
                    bindCapture(event)
                    setDrag({
                      mode: 'shift-time',
                      activityId,
                      startY: event.clientY,
                      baseMinutes: startMin,
                      currentMinutes: startMin,
                    })
                  }}
                  onStartResize={(target, id, baseDuration, event) => {
                    if (!isEditing) return
                    bindCapture(event)
                    setDrag({
                      mode: 'resize',
                      target,
                      id,
                      startY: event.clientY,
                      baseDuration,
                      currentDuration: baseDuration,
                    })
                  }}
                  onMoveTodo={moveTodo}
                  onNudgeResize={nudgeResize}
                  onNudgeActivityTime={nudgeActivityTime}
                />
              ),
            )}
            {blocks.length === 0 && (
              <p
                className="absolute right-3 left-3 text-xs text-zinc-400"
                style={{ top: (dayStartMin / 60) * HOUR_PX + 8 }}
              >
                Nothing planned yet. Use Configure to add todos or activities.
              </p>
            )}
            {showNow && (
              <div
                className="pointer-events-none absolute inset-x-0 z-30"
                style={{ top: (nowMin / 60) * HOUR_PX }}
                aria-hidden="true"
              >
                <div className="relative">
                  <span className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rounded-full bg-zinc-900" />
                  <div className="h-px bg-zinc-900" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

const controlClass = cn(
  'inline-flex size-11 items-center justify-center rounded-lg border transition-colors duration-150 ease-out',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900',
)

function HandleButton({
  label,
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  style,
  children,
}: {
  label: string
  className?: string
  onPointerDown: (event: ReactPointerEvent) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: () => void
  onKeyDown?: (event: KeyboardEvent) => void
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={className}
      style={{ touchAction: 'none', ...style }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onPointerDown(event)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {children}
    </button>
  )
}

function OrphanBreak({
  block,
  isEditing,
  isDragging,
  onPointerMove,
  onPointerUp,
  onStartResize,
  onNudge,
}: {
  block: Extract<TimelineBlock, { kind: 'break' }>
  isEditing: boolean
  isDragging: boolean
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: () => void
  onStartResize: (event: ReactPointerEvent) => void
  onNudge: (dir: -1 | 1) => void
}) {
  const { top, height } = blockBox(block.start, block.end)
  return (
    <div className="absolute right-1.5 left-1.5 z-[1]" style={{ top, height }}>
      <div
        className={cn(
          'flex h-full items-center border-y border-emerald-500/30 bg-emerald-500/15 px-2 text-[10px] text-emerald-700 dark:text-emerald-300',
          isDragging && 'bg-emerald-500/25',
        )}
      >
        Break · {block.end - block.start}m
      </div>
      {isEditing && (
        <HandleButton
          label="Resize break"
          className="absolute -bottom-2 left-1/2 z-20 flex h-11 w-16 -translate-x-1/2 items-end justify-center focus-visible:outline-2 focus-visible:outline-zinc-900"
          onPointerDown={onStartResize}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={(event) => {
            if (!event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
            event.preventDefault()
            onNudge(event.key === 'ArrowUp' ? -1 : 1)
          }}
        >
          <span className="h-1.5 w-8 rounded-full bg-emerald-600/40" />
        </HandleButton>
      )}
    </div>
  )
}

function PlanBlock({
  block,
  dayPlan,
  sessions,
  subjects,
  isEditing,
  drag,
  onPointerMove,
  onPointerUp,
  onToggleComplete,
  onStartStudy,
  onStartReorder,
  onStartShift,
  onStartResize,
  onMoveTodo,
  onNudgeResize,
  onNudgeActivityTime,
}: {
  block: Exclude<LaidOut, { kind: 'break' }>
  dayPlan: DayPlanState
  sessions: StudySession[]
  subjects: Subject[]
  isEditing: boolean
  drag: DragState | null
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: () => void
  onToggleComplete: (item: PlannedTodoItem, completed: boolean) => void
  onStartStudy: (item: PlannedTodoItem) => void
  onStartReorder: (todoId: string, event: ReactPointerEvent) => void
  onStartShift: (activityId: string, startMin: number, event: ReactPointerEvent) => void
  onStartResize: (target: 'todo' | 'activity' | 'break', id: string, baseDuration: number, event: ReactPointerEvent) => void
  onMoveTodo: (todoId: string, dir: -1 | 1) => void
  onNudgeResize: (target: 'todo' | 'activity' | 'break', id: string, currentDuration: number, dir: -1 | 1) => void
  onNudgeActivityTime: (activityId: string, startMin: number, dir: -1 | 1) => void
}) {
  const { top, height } = blockBox(block.start, block.end)
  const inset = 3
  const todoItem = block.kind === 'todo' ? dayPlan.todoQueue.find((todo) => todo.id === block.todoId) : undefined
  const subject = todoItem ? subjects.find((item) => item.id === todoItem.subjectId) : undefined
  const allDone =
    !!todoItem &&
    !!subject &&
    todoItem.categories.every((category) => getProgress(subject, todoItem.week, category) === 'completed')
  const isLastPart = block.kind !== 'todo' || !block.part || block.part.index === block.part.of
  const dragging =
    (drag?.mode === 'reorder' && block.kind === 'todo' && drag.todoId === block.todoId) ||
    (drag?.mode === 'shift-time' && block.kind === 'activity' && drag.activityId === block.activityId) ||
    (drag?.mode === 'resize' &&
      ((block.kind === 'todo' && drag.target === 'todo' && drag.id === block.todoId) ||
        (block.kind === 'activity' && drag.target === 'activity' && drag.id === block.activityId)))

  const title =
    block.kind === 'todo' ? (subject?.name ?? 'Subject') : block.name
  const subtitle =
    block.kind === 'todo'
      ? todoSubtitle(block)
      : `${formatBlockRange(block.start, block.end)} · ${block.end - block.start}m`

  const onGripKey = (event: KeyboardEvent) => {
    if (!event.altKey) return
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const dir = event.key === 'ArrowUp' ? -1 : 1
    if (block.kind === 'todo') onMoveTodo(block.todoId, dir)
    else onNudgeActivityTime(block.activityId, block.start, dir)
  }

  const resizeTarget = block.kind === 'todo' ? block.todoId : block.activityId
  const resizeBase =
    block.kind === 'todo' ? (todoItem ? todoTargetMinutes(todoItem, sessions) : block.targetMinutes) : block.end - block.start

  return (
    <div
      className="absolute"
      style={{
        top,
        height,
        left: `calc(${(block.lane / block.lanes) * 100}% + ${inset}px)`,
        width: `calc(${100 / block.lanes}% - ${inset * 2}px)`,
        zIndex: dragging ? 25 : 10,
      }}
    >
      <div
        role="group"
        aria-label={block.kind === 'todo' && block.part ? `${title}, part ${block.part.index} of ${block.part.of}, ${subtitle}` : `${title}, ${subtitle}`}
        className={cn(
          'absolute inset-0 overflow-hidden rounded-md border text-left',
          'transition-[border-color,box-shadow] duration-150 ease-out',
          block.kind === 'activity'
            ? ACTIVITY_TINT[block.color ?? 'zinc']
            : allDone
              ? 'border-zinc-900 bg-white'
              : 'border-zinc-200 bg-white',
          dragging && 'ring-2 ring-zinc-900/20',
        )}
      >
        {block.kind === 'activity' && (
          <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', ACTIVITY_ACCENT[block.color ?? 'zinc'])} />
        )}
        {block.kind === 'todo' &&
          block.breaks.map((item) => {
            const span = block.end - block.start
            if (span <= 0) return null
            const active = drag?.mode === 'resize' && drag.target === 'break' && drag.id === item.breakKey
            return (
              <div
                key={item.breakKey}
                className={cn(
                  'absolute inset-x-0 z-[1] flex items-center border-y border-emerald-500/30 bg-emerald-500/15 px-2 text-[10px] text-emerald-700 dark:text-emerald-300',
                  active && 'bg-emerald-500/25',
                )}
                style={{
                  top: `${((item.start - block.start) / span) * 100}%`,
                  height: `${((item.end - item.start) / span) * 100}%`,
                }}
              >
                Break · {item.end - item.start}m
              </div>
            )
          })}
        <div className={cn('relative z-10 flex h-full flex-col', isEditing && 'pl-9', block.kind === 'todo' && 'pr-[5.5rem]')}>
          <span className="flex items-center gap-1 px-1.5 pt-1 text-[12px] leading-tight font-semibold text-zinc-900">
            <span className="truncate">{title}</span>
            {block.kind === 'todo' && block.part && (
              <span className="shrink-0 text-[10px] font-medium text-zinc-400">
                Part {block.part.index}/{block.part.of}
              </span>
            )}
          </span>
          {height >= 32 && (
            <span className="truncate px-1.5 text-[10px] leading-tight text-zinc-500">{subtitle}</span>
          )}
          {height >= 52 && block.kind === 'todo' && (
            <span className="truncate px-1.5 text-[10px] leading-tight text-zinc-400">{block.label}</span>
          )}
        </div>
      </div>

      {block.kind === 'todo' && todoItem && (
        <div className="absolute top-0.5 right-0.5 z-20 flex">
          <button
            type="button"
            aria-label={allDone ? 'Mark incomplete' : 'Mark complete'}
            aria-pressed={allDone}
            className={cn(controlClass, allDone ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900')}
            onClick={() => onToggleComplete(todoItem, !allDone)}
          >
            <Check className="size-4" strokeWidth={allDone ? 3 : 2} />
          </button>
          <button
            type="button"
            aria-label="Start study timer"
            className={cn(controlClass, 'border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900')}
            onClick={() => onStartStudy(todoItem)}
          >
            <Play className="size-4 fill-current" />
          </button>
        </div>
      )}

      {isEditing && (
        <HandleButton
          label={block.kind === 'todo' ? 'Reorder todo' : 'Shift activity time'}
          className="absolute top-0 left-0 z-20 flex size-11 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-900"
          onPointerDown={(event) => {
            if (block.kind === 'todo') onStartReorder(block.todoId, event)
            else onStartShift(block.activityId, block.start, event)
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onGripKey}
        >
          <GripVertical className="size-4" />
        </HandleButton>
      )}

      {isEditing && isLastPart && (
        <HandleButton
          label={block.kind === 'todo' ? 'Resize study time' : 'Resize activity'}
          className="absolute -bottom-2 left-1/2 z-20 flex h-11 w-16 -translate-x-1/2 items-end justify-center focus-visible:outline-2 focus-visible:outline-zinc-900"
          onPointerDown={(event) =>
            onStartResize(block.kind === 'todo' ? 'todo' : 'activity', resizeTarget, resizeBase, event)
          }
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={(event) => {
            if (!event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
            event.preventDefault()
            onNudgeResize(
              block.kind === 'todo' ? 'todo' : 'activity',
              resizeTarget,
              resizeBase,
              event.key === 'ArrowUp' ? -1 : 1,
            )
          }}
        >
          <span className="h-1.5 w-10 rounded-full bg-zinc-300" />
        </HandleButton>
      )}

      {isEditing &&
        block.kind === 'todo' &&
        block.breaks.map((item) => {
          const span = block.end - block.start
          if (span <= 0) return null
          return (
            <HandleButton
              key={item.breakKey}
              label="Resize break"
              className="absolute right-2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center focus-visible:outline-2 focus-visible:outline-zinc-900"
              style={{ top: `${((item.end - block.start) / span) * 100}%` }}
              onPointerDown={(event) => onStartResize('break', item.breakKey, item.end - item.start, event)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onKeyDown={(event) => {
                if (!event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
                event.preventDefault()
                onNudgeResize('break', item.breakKey, item.end - item.start, event.key === 'ArrowUp' ? -1 : 1)
              }}
            >
              <span className="h-1.5 w-6 rounded-full bg-emerald-600/50" />
            </HandleButton>
          )
        })}
    </div>
  )
}
