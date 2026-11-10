/**
 * Day Planner timeline scheduler.
 *
 * Time domain: minutes since midnight. End of day is 1440 (24:00).
 * Fixed activities stay on their clock time. Other activities move out of the way.
 * Study time is continuous: 10-minute breaks stay inside one todo block.
 * A todo is split into parts only when an activity actually interrupts it.
 * Activities reset the 50-minute work counter and never sit flush against a break.
 */

import type {
  ActivityColor,
  ActivityPreset,
  DayPlanState,
  PlannedTodoItem,
  StudySession,
} from '../types'
import { formatMinutes, parseTimeRange } from './semester'
import { todoLabel, todoTargetMinutes } from './dayPlannerMath'

export const WORK_BLOCK_MINUTES = 50
export const DEFAULT_BREAK_MINUTES = 10
export const DAY_END_MINUTES = 1440

export interface TimelineBreak {
  breakKey: string
  start: number
  end: number
}

export type TimelineBlock =
  | {
      kind: 'todo'
      id: string
      todoId: string
      subjectId: string
      week: number
      categories: string[]
      start: number
      end: number
      label: string
      targetMinutes: number
      /** Study minutes inside this card, excluding internal breaks. */
      workMinutes: number
      /** Internal 10-minute breaks painted as stripes. */
      breakMinutes: number
      breaks: TimelineBreak[]
      part?: { index: number; of: number }
      truncated?: boolean
    }
  | {
      kind: 'activity'
      id: string
      activityId: string
      start: number
      end: number
      name: string
      color?: ActivityColor
      truncated?: boolean
    }
  | {
      kind: 'break'
      id: string
      breakKey: string
      start: number
      end: number
      truncated?: boolean
    }

interface ResolvedActivity {
  preset: ActivityPreset
  durationMinutes: number
  /** Set for fixed anchors and for any activity the user has shifted. */
  fixedTime?: string
}

interface PlacedActivity {
  activityId: string
  name: string
  color?: ActivityColor
  start: number
  end: number
  truncated?: boolean
}

interface Interval {
  start: number
  end: number
}

type TodoBlock = Extract<TimelineBlock, { kind: 'todo' }>

function parseHHMM(time: string): number | null {
  const range = parseTimeRange(time)
  return range ? range.start : null
}

function clampPlace(start: number, duration: number): { start: number; end: number; truncated: boolean } {
  const s = Math.max(0, Math.min(start, DAY_END_MINUTES))
  const end = Math.min(s + Math.max(0, duration), DAY_END_MINUTES)
  return { start: s, end, truncated: end - s < duration }
}

function resolveActiveActivities(dayPlan: DayPlanState, presets: ActivityPreset[]): ResolvedActivity[] {
  const byId = new Map<string, ActivityPreset>()
  for (const preset of presets) byId.set(preset.id, preset)
  for (const custom of dayPlan.customActivities) byId.set(custom.id, custom)

  const ids = new Set<string>()
  for (const id of dayPlan.selectedPresetIds) {
    if (byId.has(id)) ids.add(id)
  }
  for (const custom of dayPlan.customActivities) ids.add(custom.id)

  const resolved: ResolvedActivity[] = []
  for (const id of ids) {
    const preset = byId.get(id)
    if (!preset) continue
    const override = dayPlan.activityOverrides?.[id]
    resolved.push({
      preset,
      durationMinutes: override?.durationMinutes ?? preset.durationMinutes,
      fixedTime: override?.time ?? (preset.anchor.type === 'fixed' ? preset.anchor.time : undefined),
    })
  }
  return resolved
}

/** Keep `block` off `occupied`. Fixed activities are never passed through here. */
function settle(block: PlacedActivity, occupied: Interval[], mode: 'clip' | 'push'): void {
  let dur = Math.max(0, block.end - block.start)
  let start = Math.max(0, block.start)
  let truncated = block.truncated ?? false

  for (let guard = 0; guard < 48; guard++) {
    const hit = occupied
      .filter((interval) => start < interval.end && start + dur > interval.start)
      .sort((a, b) => a.start - b.start)[0]
    if (!hit) break
    if (mode === 'clip' && start < hit.start) {
      dur = Math.max(0, hit.start - start)
      truncated = true
      break
    }
    if (hit.end <= start) break
    start = hit.end
  }

  const next = clampPlace(start, dur)
  block.start = next.start
  block.end = next.end
  block.truncated = truncated || next.truncated
}

function placeAfterChains(afters: ResolvedActivity[], placed: Map<string, PlacedActivity>): void {
  const pending = [...afters]
  const afterIds = new Set(afters.map((item) => item.preset.id))
  let stalled = 0

  while (pending.length > 0 && stalled <= pending.length) {
    const item = pending.shift()
    if (!item || item.preset.anchor.type !== 'after') continue
    const parentId = item.preset.anchor.activityId
    if (afterIds.has(parentId) && !placed.has(parentId)) {
      pending.push(item)
      stalled++
      continue
    }
    stalled = 0
    const parent = placed.get(parentId)
    if (!parent) continue
    const block: PlacedActivity = {
      activityId: item.preset.id,
      name: item.preset.name,
      color: item.preset.color,
      start: parent.end,
      end: parent.end + item.durationMinutes,
    }
    const occupied = [...placed.values()].map((placedBlock) => ({
      start: placedBlock.start,
      end: placedBlock.end,
    }))
    settle(block, occupied, 'push')
    if (block.end > block.start) placed.set(block.activityId, block)
  }
}

function isMorningChain(id: string, resolved: ResolvedActivity[], seen = new Set<string>()): boolean {
  if (seen.has(id)) return false
  seen.add(id)
  const item = resolved.find((entry) => entry.preset.id === id)
  if (!item || item.fixedTime !== undefined) return false
  if (item.preset.anchor.type === 'start') return true
  if (item.preset.anchor.type === 'after') return isMorningChain(item.preset.anchor.activityId, resolved, seen)
  return false
}

function activityBlocks(placed: PlacedActivity[]): TimelineBlock[] {
  return placed
    .filter((block) => block.end > block.start)
    .map((block) => ({
      kind: 'activity' as const,
      id: `activity:${block.activityId}`,
      activityId: block.activityId,
      start: block.start,
      end: block.end,
      name: block.name,
      color: block.color,
      truncated: block.truncated,
    }))
}

/**
 * Fill free gaps with the todo queue. Auto-breaks are separate blocks here;
 * `coalesceTimeline` folds same-todo breaks into one card.
 */
function scheduleTodos(
  dayPlan: DayPlanState,
  sessions: StudySession[],
  flowStart: number,
  occupied: PlacedActivity[],
): { blocks: TimelineBlock[]; doneAt: number } {
  const barriers = occupied
    .map((activity) => ({ start: activity.start, end: activity.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const blocks: TimelineBlock[] = []
  let cursor = flowStart
  let workStreak = 0
  let breakIndex = 0
  let barrierIdx = 0

  const nextBarrier = (): Interval | null => {
    while (barrierIdx < barriers.length && barriers[barrierIdx].end <= cursor) barrierIdx++
    return barrierIdx < barriers.length ? barriers[barrierIdx] : null
  }

  const pushBreak = (at: number): number => {
    const barrier = nextBarrier()
    const maxEnd = barrier ? Math.min(barrier.start, DAY_END_MINUTES) : DAY_END_MINUTES
    if (at >= maxEnd) return at
    const breakKey = `break:${breakIndex++}`
    const duration = dayPlan.breakOverrides?.[breakKey] ?? DEFAULT_BREAK_MINUTES
    const flushWithActivity =
      duration <= 0 ||
      (barrier !== null && at + duration >= barrier.start) ||
      barriers.some((item) => item.end === at)
    if (flushWithActivity) return at
    const end = Math.min(at + duration, maxEnd)
    if (end <= at) return at
    blocks.push({
      kind: 'break',
      id: breakKey,
      breakKey,
      start: at,
      end,
      truncated: end - at < duration,
    })
    return end
  }

  for (const todo of dayPlan.todoQueue) {
    let remaining = todoTargetMinutes(todo, sessions)
    const label = todoLabel(todo.categories)
    const targetMinutes = remaining
    let lastWork: TodoBlock | null = null

    while (remaining > 0 && cursor < DAY_END_MINUTES) {
      let barrier = nextBarrier()
      while (barrier && barrier.start <= cursor) {
        cursor = Math.max(cursor, barrier.end)
        workStreak = 0
        barrierIdx++
        barrier = nextBarrier()
      }

      if (cursor >= DAY_END_MINUTES) break

      const gapEnd = barrier ? barrier.start : DAY_END_MINUTES
      if (cursor >= gapEnd) {
        if (barrier) {
          cursor = barrier.end
          workStreak = 0
          barrierIdx++
          continue
        }
        break
      }

      if (workStreak >= WORK_BLOCK_MINUTES) {
        const afterBreak = pushBreak(cursor)
        if (afterBreak > cursor) {
          cursor = afterBreak
          workStreak = 0
          continue
        }
        workStreak = 0
      }

      const untilBreak = WORK_BLOCK_MINUTES - workStreak
      const chunk = Math.min(remaining, untilBreak, gapEnd - cursor)
      if (chunk <= 0) {
        if (barrier) {
          cursor = barrier.end
          workStreak = 0
          barrierIdx++
          continue
        }
        break
      }

      const start = cursor
      const end = start + chunk
      const work: TodoBlock = {
        kind: 'todo',
        id: `todo:${todo.id}:${start}`,
        todoId: todo.id,
        subjectId: todo.subjectId,
        week: todo.week,
        categories: todo.categories,
        start,
        end,
        label,
        targetMinutes,
        workMinutes: chunk,
        breakMinutes: 0,
        breaks: [],
      }
      blocks.push(work)
      lastWork = work
      cursor = end
      remaining -= chunk
      workStreak += chunk

      if (remaining > 0 && workStreak >= WORK_BLOCK_MINUTES) {
        const upcoming = nextBarrier()
        if (upcoming && upcoming.start === cursor) {
          workStreak = 0
          continue
        }
        const afterBreak = pushBreak(cursor)
        if (afterBreak > cursor) {
          cursor = afterBreak
          workStreak = 0
        } else {
          workStreak = 0
        }
      }
    }

    if (remaining > 0 && lastWork) lastWork.truncated = true
  }

  return { blocks, doneAt: cursor }
}

/** Fold same-todo work and the breaks between it into one card. Activities stay split points. */
function coalesceTimeline(blocks: TimelineBlock[]): TimelineBlock[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
  const out: TimelineBlock[] = []
  let index = 0

  while (index < sorted.length) {
    const block = sorted[index]
    if (block.kind !== 'todo') {
      out.push(block)
      index++
      continue
    }

    const works: TodoBlock[] = [block]
    const breaks: TimelineBreak[] = []
    let end = block.end
    index++

    while (index < sorted.length) {
      const next = sorted[index]
      if (next.kind === 'break' && next.start === end) {
        const after = sorted[index + 1]
        if (after && after.kind === 'todo' && after.todoId === block.todoId && after.start === next.end) {
          breaks.push({ breakKey: next.breakKey, start: next.start, end: next.end })
          end = next.end
          index++
          continue
        }
        break
      }
      if (next.kind === 'todo' && next.todoId === block.todoId && next.start === end) {
        works.push(next)
        end = next.end
        index++
        continue
      }
      break
    }

    const last = works[works.length - 1]
    const workMinutes = works.reduce((sum, work) => sum + work.workMinutes, 0)
    const breakMinutes = breaks.reduce((sum, item) => sum + (item.end - item.start), 0)
    out.push({
      kind: 'todo',
      id: `todo:${block.todoId}`,
      todoId: block.todoId,
      subjectId: block.subjectId,
      week: block.week,
      categories: block.categories,
      start: works[0].start,
      end: last.end,
      label: block.label,
      targetMinutes: block.targetMinutes,
      workMinutes,
      breakMinutes,
      breaks,
      truncated: last.truncated,
    })
  }

  const counts = new Map<string, number>()
  for (const block of out) {
    if (block.kind === 'todo') counts.set(block.todoId, (counts.get(block.todoId) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  return out.map((block) => {
    if (block.kind !== 'todo') return block
    const of = counts.get(block.todoId) ?? 1
    if (of <= 1) return block
    const partIndex = (seen.get(block.todoId) ?? 0) + 1
    seen.set(block.todoId, partIndex)
    return { ...block, id: `todo:${block.todoId}:part${partIndex}`, part: { index: partIndex, of } }
  })
}

export interface ScheduleResult {
  blocks: TimelineBlock[]
  doneAt: number
  flowStart: number
}

export function scheduleDayPlan(
  dayPlan: DayPlanState,
  presets: ActivityPreset[],
  sessions: StudySession[],
): ScheduleResult {
  const resolved = resolveActiveActivities(dayPlan, presets)
  const dayStart = parseHHMM(dayPlan.dayStartTime) ?? 8 * 60
  const placed = new Map<string, PlacedActivity>()

  for (const item of resolved) {
    if (item.fixedTime === undefined) continue
    const startMin = parseHHMM(item.fixedTime) ?? dayStart
    const { start, end, truncated } = clampPlace(startMin, item.durationMinutes)
    if (end <= start) continue
    placed.set(item.preset.id, {
      activityId: item.preset.id,
      name: item.preset.name,
      color: item.preset.color,
      start,
      end,
      truncated,
    })
  }

  const starts = resolved
    .filter((item) => item.fixedTime === undefined && item.preset.anchor.type === 'start')
    .sort((a, b) => {
      const priorityA = a.preset.anchor.type === 'start' ? a.preset.anchor.priority : 0
      const priorityB = b.preset.anchor.type === 'start' ? b.preset.anchor.priority : 0
      return priorityA - priorityB || a.preset.id.localeCompare(b.preset.id)
    })

  let startCursor = dayStart
  for (const item of starts) {
    const block: PlacedActivity = {
      activityId: item.preset.id,
      name: item.preset.name,
      color: item.preset.color,
      start: startCursor,
      end: startCursor + item.durationMinutes,
    }
    settle(
      block,
      [...placed.values()].map((placedBlock) => ({ start: placedBlock.start, end: placedBlock.end })),
      'clip',
    )
    if (block.end > block.start) placed.set(item.preset.id, block)
    startCursor = Math.max(startCursor, block.end)
  }

  placeAfterChains(
    resolved.filter((item) => item.fixedTime === undefined && item.preset.anchor.type === 'after'),
    placed,
  )

  let flowStart = dayStart
  for (const [id, block] of placed) {
    if (isMorningChain(id, resolved)) flowStart = Math.max(flowStart, block.end)
  }

  const midPlaced = [...placed.values()]
  const { blocks: todoBlocks, doneAt } = scheduleTodos(dayPlan, sessions, flowStart, midPlaced)

  const ends = resolved
    .filter((item) => item.fixedTime === undefined && item.preset.anchor.type === 'end')
    .sort((a, b) => {
      const priorityA = a.preset.anchor.type === 'end' ? a.preset.anchor.priority : 0
      const priorityB = b.preset.anchor.type === 'end' ? b.preset.anchor.priority : 0
      return priorityA - priorityB || a.preset.id.localeCompare(b.preset.id)
    })

  let endCursor = doneAt
  const endOccupied: Interval[] = midPlaced.map((block) => ({ start: block.start, end: block.end }))
  const endPlaced: PlacedActivity[] = []
  for (const item of ends) {
    const block: PlacedActivity = {
      activityId: item.preset.id,
      name: item.preset.name,
      color: item.preset.color,
      start: endCursor,
      end: endCursor + item.durationMinutes,
    }
    settle(block, endOccupied, 'push')
    if (block.end > block.start) {
      endPlaced.push(block)
      endOccupied.push({ start: block.start, end: block.end })
      endCursor = block.end
    }
  }

  const blocks = coalesceTimeline([...activityBlocks([...midPlaced, ...endPlaced]), ...todoBlocks])
  return { blocks, doneAt: endCursor, flowStart }
}

export function formatBlockRange(start: number, end: number): string {
  return `${formatMinutes(start)}–${formatMinutes(Math.min(end, DAY_END_MINUTES))}`
}

/** Apply a transient draft (reorder / overrides) on top of a day plan without mutating it. */
export function withDayPlanDraft(
  dayPlan: DayPlanState,
  draft: {
    todoQueue?: PlannedTodoItem[]
    breakOverrides?: Record<string, number>
    activityOverrides?: DayPlanState['activityOverrides']
  },
): DayPlanState {
  return {
    ...dayPlan,
    ...(draft.todoQueue ? { todoQueue: draft.todoQueue } : {}),
    ...(draft.breakOverrides ? { breakOverrides: draft.breakOverrides } : {}),
    ...(draft.activityOverrides ? { activityOverrides: draft.activityOverrides } : {}),
  }
}
