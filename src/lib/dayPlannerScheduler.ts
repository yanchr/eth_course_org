import type {
  ActivityColor,
  ActivityPreset,
  BlockAnchor,
  DayPlanState,
  PlannedTodoItem,
  StudySession,
} from '../types'
import { todoLabel, todoTargetMinutes } from './dayPlannerMath'
import { formatMinutes, parseTimeRange } from './semester'

export const WORK_BLOCK_MINUTES = 50
export const DEFAULT_BREAK_MINUTES = 10
export const MIN_FLOW_GAP_MINUTES = 20
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
      workMinutes: number
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

type TodoTimelineBlock = Extract<TimelineBlock, { kind: 'todo' }>

interface Schedulable {
  id: string
  kind: 'todo' | 'activity'
  anchor: BlockAnchor
  duration: number
  order: number
  todo?: PlannedTodoItem
  activity?: ActivityPreset
}

interface Placement {
  id: string
  kind: 'todo' | 'activity'
  start: number
  end: number
}

interface ScheduleContext {
  dayPlan: DayPlanState
  sessions: StudySession[]
  all: Schedulable[]
  placed: Map<string, Placement>
  blocks: TimelineBlock[]
  breakIndex: number
}

function parseHHMM(time: string): number | null {
  return parseTimeRange(time)?.start ?? null
}

/** Wall-clock span of uninterrupted todo work, including its internal break stripes. */
export function todoTotalSpan(workMinutes: number): number {
  const work = Math.max(0, Math.round(workMinutes))
  return work + Math.floor(Math.max(0, work - 1) / WORK_BLOCK_MINUTES) * DEFAULT_BREAK_MINUTES
}

function activeItems(
  dayPlan: DayPlanState,
  presets: ActivityPreset[],
  sessions: StudySession[],
): Schedulable[] {
  const presetById = new Map(presets.map((preset) => [preset.id, preset]))
  for (const custom of dayPlan.customActivities) presetById.set(custom.id, custom)

  const activityIds = [
    ...dayPlan.selectedPresetIds.filter((id) => presetById.has(id)),
    ...dayPlan.customActivities.map((activity) => activity.id),
  ]
  const uniqueActivityIds = [...new Set(activityIds)]
  const activities = uniqueActivityIds.flatMap((id, order): Schedulable[] => {
    const preset = presetById.get(id)
    if (!preset) return []
    const override = dayPlan.activityOverrides?.[id]
    let anchor = override?.anchor ?? preset.anchor
    if (override?.time) anchor = { type: 'fixed', time: override.time }
    return [{
      id,
      kind: 'activity',
      anchor,
      duration: Math.max(0, override?.durationMinutes ?? preset.durationMinutes),
      order,
      activity: preset,
    }]
  })

  const todos = dayPlan.todoQueue.map((todo, order): Schedulable => {
    const work = todoTargetMinutes(todo, sessions)
    const snappedDuration =
      todo.snappedStartMinute !== undefined && todo.snappedEndMinute !== undefined
        ? todo.snappedEndMinute - todo.snappedStartMinute
        : undefined
    return {
      id: todo.id,
      kind: 'todo',
      anchor: todo.anchor ?? { type: 'flow' },
      duration: snappedDuration ?? todoTotalSpan(work),
      order,
      todo,
    }
  })
  return [...activities, ...todos]
}

function nextBreak(ctx: ScheduleContext): { key: string; duration: number } {
  const key = `break:${ctx.breakIndex++}`
  return { key, duration: ctx.dayPlan.breakOverrides?.[key] ?? DEFAULT_BREAK_MINUTES }
}

function todoWorkBlock(todo: PlannedTodoItem, target: number, start: number, end: number): TodoTimelineBlock {
  return {
    kind: 'todo',
    id: `todo:${todo.id}:${start}`,
    todoId: todo.id,
    subjectId: todo.subjectId,
    week: todo.week,
    categories: todo.categories,
    start,
    end,
    label: todoLabel(todo.categories),
    targetMinutes: target,
    workMinutes: end - start,
    breakMinutes: 0,
    breaks: [],
  }
}

/** Render an anchored todo at an exact start, with internal break stripes. */
function renderExactTodo(ctx: ScheduleContext, item: Schedulable, start: number): number {
  const todo = item.todo!
  const target = todoTargetMinutes(todo, ctx.sessions)
  let remaining = target
  let cursor = Math.max(0, start)
  while (remaining > 0 && cursor < DAY_END_MINUTES) {
    const work = Math.min(WORK_BLOCK_MINUTES, remaining, DAY_END_MINUTES - cursor)
    if (work <= 0) break
    ctx.blocks.push(todoWorkBlock(todo, target, cursor, cursor + work))
    cursor += work
    remaining -= work
    if (remaining > 0 && cursor < DAY_END_MINUTES) {
      const { key, duration } = nextBreak(ctx)
      const end = Math.min(DAY_END_MINUTES, cursor + Math.max(0, duration))
      if (end > cursor) {
        ctx.blocks.push({ kind: 'break', id: key, breakKey: key, start: cursor, end })
        cursor = end
      }
    }
  }
  if (remaining > 0) {
    const last = [...ctx.blocks].reverse().find(
      (block): block is TodoTimelineBlock => block.kind === 'todo' && block.todoId === todo.id,
    )
    if (last) last.truncated = true
  }
  return cursor
}

function renderSnappedTodo(ctx: ScheduleContext, item: Schedulable): Placement {
  const todo = item.todo!
  const start = Math.max(0, Math.min(todo.snappedStartMinute!, DAY_END_MINUTES))
  const end = Math.min(
    DAY_END_MINUTES,
    Math.max(start + 5, Math.min(todo.snappedEndMinute!, DAY_END_MINUTES)),
  )
  const breaks: TimelineBreak[] = []
  let cursor = start + WORK_BLOCK_MINUTES
  while (cursor + DEFAULT_BREAK_MINUTES <= end) {
    const breakEnd = cursor + DEFAULT_BREAK_MINUTES
    if (breakEnd <= end) {
      const key = `break:${ctx.breakIndex++}`
      breaks.push({ breakKey: key, start: cursor, end: breakEnd })
    }
    cursor = breakEnd + WORK_BLOCK_MINUTES
  }
  const breakMinutes = breaks.reduce((sum, item) => sum + item.end - item.start, 0)
  ctx.blocks.push({
    ...todoWorkBlock(todo, Math.max(5, end - start - breakMinutes), start, end),
    id: `todo:${todo.id}:snapped`,
    workMinutes: Math.max(0, end - start - breakMinutes),
    breakMinutes,
    breaks,
  })
  const placement = { id: item.id, kind: item.kind, start, end }
  ctx.placed.set(item.id, placement)
  return placement
}

function placeExact(ctx: ScheduleContext, item: Schedulable, requestedStart: number): Placement {
  if (
    item.todo?.snappedStartMinute !== undefined &&
    item.todo.snappedEndMinute !== undefined
  ) {
    return renderSnappedTodo(ctx, item)
  }
  const start = Math.max(0, Math.min(requestedStart, DAY_END_MINUTES))
  let end: number
  if (item.kind === 'activity') {
    end = Math.min(DAY_END_MINUTES, start + item.duration)
    ctx.blocks.push({
      kind: 'activity',
      id: `activity:${item.id}`,
      activityId: item.id,
      start,
      end,
      name: item.activity!.name,
      color: item.activity!.color,
      truncated: end - start < item.duration,
    })
  } else {
    end = renderExactTodo(ctx, item, start)
  }
  const placement = { id: item.id, kind: item.kind, start, end }
  ctx.placed.set(item.id, placement)
  return placement
}

function attached(ctx: ScheduleContext, type: 'before' | 'after', targetId: string): Schedulable[] {
  return ctx.all
    .filter((item) => item.anchor.type === type && item.anchor.targetId === targetId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/** Resolve both directions from a known block. `visited` prevents dependency cycles. */
function resolveKnown(ctx: ScheduleContext, id: string, visited = new Set<string>()): void {
  if (visited.has(id)) return
  visited.add(id)
  const target = ctx.placed.get(id)
  if (!target) return

  for (const item of attached(ctx, 'before', id)) {
    if (ctx.placed.has(item.id) || visited.has(item.id)) continue
    const placement = placeExact(ctx, item, target.start - item.duration)
    resolveKnown(ctx, placement.id, visited)
  }
  for (const item of attached(ctx, 'after', id)) {
    if (ctx.placed.has(item.id) || visited.has(item.id)) continue
    const placement = placeExact(ctx, item, target.end)
    resolveKnown(ctx, placement.id, visited)
  }
}

function occupied(ctx: ScheduleContext): Placement[] {
  return [...ctx.placed.values()].sort((a, b) => a.start - b.start || a.end - b.end)
}

function advancePastOccupied(cursor: number, placements: Placement[]): number {
  let next = cursor
  for (const placement of placements) {
    if (next >= placement.start && next < placement.end) next = placement.end
  }
  return next
}

function scheduleFlowActivity(ctx: ScheduleContext, item: Schedulable, cursor: number): number {
  let start = advancePastOccupied(cursor, occupied(ctx))
  for (let guard = 0; guard < 100; guard++) {
    const hit = occupied(ctx).find((block) => start < block.end && start + item.duration > block.start)
    if (!hit) break
    start = hit.end
  }
  return placeExact(ctx, item, start).end
}

function scheduleFlowTodo(ctx: ScheduleContext, item: Schedulable, initialCursor: number): number {
  if (
    item.todo?.snappedStartMinute !== undefined &&
    item.todo.snappedEndMinute !== undefined
  ) {
    return Math.max(initialCursor, renderSnappedTodo(ctx, item).end)
  }
  const todo = item.todo!
  const target = todoTargetMinutes(todo, ctx.sessions)
  let remaining = target
  let cursor = initialCursor
  let workStreak = 0

  while (remaining > 0 && cursor < DAY_END_MINUTES) {
    const placements = occupied(ctx)
    const containing = placements.find((block) => cursor >= block.start && cursor < block.end)
    if (containing) {
      cursor = containing.end
      if (containing.kind === 'activity') workStreak = 0
      continue
    }
    const barrier = placements.find((block) => block.start >= cursor)
    const gapEnd = barrier?.start ?? DAY_END_MINUTES
    const gapMinutes = gapEnd - cursor
    const firstWorkCapacity = Math.max(0, WORK_BLOCK_MINUTES - workStreak)
    const remainingTotalSpan =
      remaining <= firstWorkCapacity
        ? remaining
        : firstWorkCapacity + DEFAULT_BREAK_MINUTES + todoTotalSpan(remaining - firstWorkCapacity)
    if (
      barrier &&
      gapMinutes < MIN_FLOW_GAP_MINUTES &&
      remainingTotalSpan > gapMinutes
    ) {
      cursor = barrier.end
      if (barrier.kind === 'activity') workStreak = 0
      continue
    }

    if (workStreak >= WORK_BLOCK_MINUTES) {
      const { key, duration } = nextBreak(ctx)
      if (duration > 0 && cursor + duration < gapEnd) {
        ctx.blocks.push({ kind: 'break', id: key, breakKey: key, start: cursor, end: cursor + duration })
        cursor += duration
      }
      workStreak = 0
      continue
    }

    const chunk = Math.min(remaining, WORK_BLOCK_MINUTES - workStreak, gapEnd - cursor)
    if (chunk <= 0) {
      if (!barrier) break
      cursor = barrier.end
      if (barrier.kind === 'activity') workStreak = 0
      continue
    }
    ctx.blocks.push(todoWorkBlock(todo, target, cursor, cursor + chunk))
    cursor += chunk
    remaining -= chunk
    workStreak += chunk
  }

  if (remaining > 0) {
    const last = [...ctx.blocks].reverse().find(
      (block): block is TodoTimelineBlock => block.kind === 'todo' && block.todoId === todo.id,
    )
    if (last) last.truncated = true
  }
  const starts = ctx.blocks.filter((block) => block.kind === 'todo' && block.todoId === todo.id)
  const start = starts.length ? Math.min(...starts.map((block) => block.start)) : cursor
  const placement = { id: item.id, kind: item.kind, start, end: cursor }
  ctx.placed.set(item.id, placement)
  return cursor
}

function scheduleStreamItem(ctx: ScheduleContext, item: Schedulable, cursor: number): number {
  if (ctx.placed.has(item.id)) return Math.max(cursor, ctx.placed.get(item.id)!.end)
  return item.kind === 'activity'
    ? scheduleFlowActivity(ctx, item, cursor)
    : scheduleFlowTodo(ctx, item, cursor)
}

/** Schedule a flow/end root with dependencies immediately around it. */
function scheduleStreamGroup(
  ctx: ScheduleContext,
  item: Schedulable,
  cursor: number,
  visited = new Set<string>(),
): number {
  if (visited.has(item.id)) return cursor
  visited.add(item.id)
  for (const before of attached(ctx, 'before', item.id)) {
    cursor = scheduleStreamGroup(ctx, before, cursor, visited)
  }
  cursor = scheduleStreamItem(ctx, item, cursor)
  for (const after of attached(ctx, 'after', item.id)) {
    cursor = scheduleStreamGroup(ctx, after, cursor, visited)
  }
  return cursor
}

function coalesceTimeline(blocks: TimelineBlock[]): TimelineBlock[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
  const out: TimelineBlock[] = []
  let index = 0
  while (index < sorted.length) {
    const first = sorted[index]
    if (first.kind !== 'todo') {
      out.push(first)
      index++
      continue
    }
    const works = [first]
    const breaks: TimelineBreak[] = [...first.breaks]
    let end = first.end
    index++
    while (index < sorted.length) {
      const next = sorted[index]
      if (next.kind === 'break' && next.start === end) {
        const after = sorted[index + 1]
        if (after?.kind === 'todo' && after.todoId === first.todoId && after.start === next.end) {
          breaks.push({ breakKey: next.breakKey, start: next.start, end: next.end })
          end = next.end
          index++
          continue
        }
      }
      if (next.kind === 'todo' && next.todoId === first.todoId && next.start === end) {
        works.push(next)
        end = next.end
        index++
        continue
      }
      break
    }
    const last = works[works.length - 1]
    out.push({
      ...first,
      id: `todo:${first.todoId}`,
      end: last.end,
      workMinutes: works.reduce((sum, work) => sum + work.workMinutes, 0),
      breakMinutes: breaks.reduce((sum, item) => sum + item.end - item.start, 0),
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
    if (of === 1) return block
    const part = (seen.get(block.todoId) ?? 0) + 1
    seen.set(block.todoId, part)
    return { ...block, id: `todo:${block.todoId}:part${part}`, part: { index: part, of } }
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
  const all = activeItems(dayPlan, presets, sessions)
  const ctx: ScheduleContext = {
    dayPlan,
    sessions,
    all,
    placed: new Map(),
    blocks: [],
    breakIndex: 0,
  }
  const dayStart = parseHHMM(dayPlan.dayStartTime) ?? 8 * 60

  const starts = all
    .filter((item) => item.anchor.type === 'start')
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'activity' ? -1 : 1
      const pa = a.anchor.type === 'start' ? a.anchor.priority : 0
      const pb = b.anchor.type === 'start' ? b.anchor.priority : 0
      return pa - pb || a.order - b.order
    })
  let startCursor = dayStart
  for (const item of starts) {
    if (ctx.placed.has(item.id)) continue
    const placed = placeExact(ctx, item, startCursor)
    resolveKnown(ctx, item.id)
    startCursor = Math.max(startCursor, placed.end, ...[...ctx.placed.values()].map((block) => block.end))
  }
  const flowStart = startCursor

  const fixed = all.filter((item) => item.anchor.type === 'fixed')
  for (const item of fixed) {
    if (ctx.placed.has(item.id) || item.anchor.type !== 'fixed') continue
    placeExact(ctx, item, parseHHMM(item.anchor.time) ?? dayStart)
  }
  for (const item of fixed) resolveKnown(ctx, item.id)

  let cursor = flowStart
  const flow = all
    .filter((item) => item.anchor.type === 'flow')
    .sort((a, b) => a.order - b.order || (a.kind === 'todo' ? -1 : 1))
  for (const item of flow) cursor = scheduleStreamGroup(ctx, item, cursor)

  const maxEnd = ctx.placed.size
    ? Math.max(...[...ctx.placed.values()].map((block) => block.end))
    : dayStart
  cursor = maxEnd
  const ends = all
    .filter((item) => item.anchor.type === 'end')
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'todo' ? -1 : 1
      const pa = a.anchor.type === 'end' ? a.anchor.priority : 0
      const pb = b.anchor.type === 'end' ? b.anchor.priority : 0
      return pa - pb || a.order - b.order
    })
  for (const item of ends) cursor = scheduleStreamGroup(ctx, item, cursor)

  const blocks = coalesceTimeline(ctx.blocks)
  const doneAt = blocks.reduce((max, block) => Math.max(max, block.end), dayStart)
  return { blocks, doneAt, flowStart }
}

export function formatBlockRange(start: number, end: number): string {
  return `${formatMinutes(start)}–${formatMinutes(Math.min(end, DAY_END_MINUTES))}`
}

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
