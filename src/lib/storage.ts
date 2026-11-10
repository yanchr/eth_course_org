import {
  DAYS,
  DEFAULT_CATEGORIES,
  WEEK_COUNT,
  type ActiveStudy,
  type ActivityAnchor,
  type ActivityColor,
  type ActivityOverride,
  type ActivityPreset,
  type DayPlanState,
  type PlannedTodoItem,
  type PlannerData,
  type ProgressState,
  type ScheduleSlot,
  type StudySession,
  type Subject,
  type SubjectEvent,
  type SubjectLink,
} from '../types'
import { createId } from './id'
import { toISODate } from './semester'

export const STORAGE_KEY = 'eth-course-planner:v1'
export const DEFAULT_SEMESTER_START = '2026-09-14'

const ACTIVITY_COLORS: ActivityColor[] = ['amber', 'sky', 'violet', 'rose', 'zinc']
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export function createDefaultActivityPresets(): ActivityPreset[] {
  return [
    {
      id: 'travel_to_uni',
      name: 'travel_to_uni',
      durationMinutes: 50,
      anchor: { type: 'start', priority: 0 },
      isDefault: true,
      color: 'sky',
    },
    {
      id: 'Lunch',
      name: 'Lunch',
      durationMinutes: 60,
      anchor: { type: 'fixed', time: '11:30' },
      isDefault: true,
      color: 'amber',
    },
    {
      id: 'Sleeping',
      name: 'Sleeping',
      durationMinutes: 20,
      anchor: { type: 'after', activityId: 'Lunch' },
      isDefault: true,
      color: 'violet',
    },
    {
      id: 'travel_from_uni',
      name: 'travel_from_uni',
      durationMinutes: 50,
      anchor: { type: 'end', priority: 0 },
      isDefault: true,
      color: 'sky',
    },
  ]
}

export function createDefaultDayPlan(
  presets: ActivityPreset[] = createDefaultActivityPresets(),
  date = toISODate(new Date()),
): DayPlanState {
  return {
    date,
    dayStartTime: '08:00',
    selectedPresetIds: presets.filter((p) => p.isDefault).map((p) => p.id),
    customActivities: [],
    todoQueue: [],
  }
}

export function createDefaultData(): PlannerData {
  const activityPresets = createDefaultActivityPresets()
  return {
    version: 1,
    settings: { semesterStartDate: DEFAULT_SEMESTER_START, weekCount: WEEK_COUNT },
    subjects: [],
    studySessions: [],
    activeStudy: null,
    activityPresets,
    dayPlan: createDefaultDayPlan(activityPresets),
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const PROGRESS_STATES: ProgressState[] = ['pending', 'completed', 'canceled']
const isWeek = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= WEEK_COUNT

function parseLink(raw: unknown): SubjectLink | null {
  if (!isObject(raw)) return null
  const url = str(raw.url).trim()
  if (!url) return null
  return { id: str(raw.id) || createId(), label: str(raw.label) || url, url }
}

function parseSlot(raw: unknown): ScheduleSlot | null {
  if (!isObject(raw)) return null
  const type = str(raw.type).trim() || 'lecture'
  const day = DAYS.find((d) => d === raw.day)
  if (!day) return null
  return { id: str(raw.id) || createId(), type, day, time: str(raw.time), room: str(raw.room) }
}

function parseEvent(raw: unknown): SubjectEvent | null {
  if (!isObject(raw)) return null
  const name = str(raw.name).trim()
  if (!name || !isWeek(raw.week)) return null
  return {
    id: str(raw.id) || createId(),
    name,
    week: raw.week,
    slots: Array.isArray(raw.slots) ? raw.slots.map(parseSlot).filter((s) => s !== null) : [],
    links: Array.isArray(raw.links) ? raw.links.map(parseLink).filter((l) => l !== null) : [],
  }
}

function parseSubject(raw: unknown): Subject | null {
  if (!isObject(raw)) return null
  const name = str(raw.name).trim()
  if (!name) return null

  const categories = Array.isArray(raw.categories)
    ? raw.categories.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    : []

  const progress: Record<string, ProgressState> = {}
  if (isObject(raw.progress)) {
    for (const [key, value] of Object.entries(raw.progress)) {
      const state = PROGRESS_STATES.find((s) => s === value)
      if (state && state !== 'pending') progress[key] = state
    }
  }

  const completedAt: Record<string, string> = {}
  if (isObject(raw.completedAt)) {
    for (const [key, value] of Object.entries(raw.completedAt)) {
      if (typeof value !== 'string' || progress[key] !== 'completed') continue
      const at = Date.parse(value)
      if (!Number.isNaN(at)) completedAt[key] = new Date(at).toISOString()
    }
  }

  const calendarOnly = raw.calendarOnly === true
  const events = Array.isArray(raw.events) ? raw.events.map(parseEvent).filter((e) => e !== null) : []

  return {
    id: str(raw.id) || createId(),
    name,
    lecturer: str(raw.lecturer),
    links: Array.isArray(raw.links) ? raw.links.map(parseLink).filter((l) => l !== null) : [],
    scheduleSlots: Array.isArray(raw.scheduleSlots)
      ? raw.scheduleSlots.map(parseSlot).filter((s) => s !== null)
      : [],
    categories: calendarOnly ? categories : categories.length ? categories : [...DEFAULT_CATEGORIES],
    progress,
    ...(Object.keys(completedAt).length > 0 ? { completedAt } : {}),
    ...(events.length > 0 ? { events } : {}),
    ...(typeof raw.onceWeek === 'number' &&
    Number.isInteger(raw.onceWeek) &&
    raw.onceWeek >= 1 &&
    raw.onceWeek <= WEEK_COUNT
      ? { onceWeek: raw.onceWeek }
      : {}),
    ...(calendarOnly ? { calendarOnly: true } : {}),
  }
}

const isDuration = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((c): c is string => typeof c === 'string' && c !== ''))] : []

function parseStudySession(raw: unknown): StudySession | null {
  if (!isObject(raw)) return null
  const subjectId = str(raw.subjectId)
  if (!subjectId || !isWeek(raw.week) || !isDuration(raw.durationMs)) return null
  const endedMs = Date.parse(str(raw.endedAt))
  const end = Number.isNaN(endedMs) ? Date.now() : endedMs
  const startedMs = Date.parse(str(raw.startedAt))
  const start = Number.isNaN(startedMs) || startedMs > end ? end - raw.durationMs : startedMs
  return {
    id: str(raw.id) || createId(),
    subjectId,
    week: raw.week,
    categories: stringList(raw.categories),
    durationMs: raw.durationMs,
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
  }
}

function parseActiveStudy(raw: unknown): ActiveStudy | null {
  if (!isObject(raw)) return null
  const subjectId = str(raw.subjectId)
  if (!subjectId || !isWeek(raw.week)) return null
  const accumulatedMs = isDuration(raw.accumulatedMs) ? raw.accumulatedMs : 0
  const resumedAt = isDuration(raw.resumedAt) ? raw.resumedAt : null
  return {
    subjectId,
    week: raw.week,
    categories: stringList(raw.categories),
    startedAt: isDuration(raw.startedAt) ? raw.startedAt : (resumedAt ?? Date.now()) - accumulatedMs,
    accumulatedMs,
    resumedAt,
  }
}

function parseAnchor(raw: unknown): ActivityAnchor | null {
  if (!isObject(raw)) return null
  const type = str(raw.type)
  if (type === 'fixed') {
    const time = str(raw.time)
    return HHMM.test(time) ? { type: 'fixed', time } : null
  }
  if (type === 'start' || type === 'end') {
    const priority = typeof raw.priority === 'number' && Number.isFinite(raw.priority) ? raw.priority : 0
    return { type, priority }
  }
  if (type === 'after') {
    const activityId = str(raw.activityId)
    return activityId ? { type: 'after', activityId } : null
  }
  return null
}

function parseActivityPreset(raw: unknown): ActivityPreset | null {
  if (!isObject(raw)) return null
  const id = str(raw.id) || createId()
  const name = str(raw.name).trim()
  const durationMinutes =
    typeof raw.durationMinutes === 'number' && Number.isFinite(raw.durationMinutes) && raw.durationMinutes > 0
      ? Math.round(raw.durationMinutes)
      : 0
  const anchor = parseAnchor(raw.anchor)
  if (!name || !durationMinutes || !anchor) return null
  const color = ACTIVITY_COLORS.find((c) => c === raw.color)
  return {
    id,
    name,
    durationMinutes,
    anchor,
    isDefault: raw.isDefault === true,
    ...(color ? { color } : {}),
  }
}

function parsePlannedTodo(raw: unknown): PlannedTodoItem | null {
  if (!isObject(raw)) return null
  const subjectId = str(raw.subjectId)
  const categories = stringList(raw.categories)
  if (!subjectId || !isWeek(raw.week) || categories.length === 0) return null
  const custom =
    typeof raw.customDurationMinutes === 'number' &&
    Number.isFinite(raw.customDurationMinutes) &&
    raw.customDurationMinutes > 0
      ? Math.round(raw.customDurationMinutes)
      : undefined
  return {
    id: str(raw.id) || createId(),
    subjectId,
    week: raw.week,
    categories,
    includeSdBuffer: raw.includeSdBuffer !== false,
    ...(custom !== undefined ? { customDurationMinutes: custom } : {}),
  }
}

function parseBreakOverrides(raw: unknown): Record<string, number> | undefined {
  if (!isObject(raw)) return undefined
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[key] = Math.round(value)
  }
  return Object.keys(out).length ? out : undefined
}

function parseActivityOverrides(raw: unknown): Record<string, ActivityOverride> | undefined {
  if (!isObject(raw)) return undefined
  const out: Record<string, ActivityOverride> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isObject(value)) continue
    const override: ActivityOverride = {}
    if (
      typeof value.durationMinutes === 'number' &&
      Number.isFinite(value.durationMinutes) &&
      value.durationMinutes > 0
    ) {
      override.durationMinutes = Math.round(value.durationMinutes)
    }
    const time = str(value.time)
    if (HHMM.test(time)) override.time = time
    if (override.durationMinutes !== undefined || override.time !== undefined) out[key] = override
  }
  return Object.keys(out).length ? out : undefined
}

function parseDayPlan(raw: unknown, presets: ActivityPreset[]): DayPlanState {
  const defaults = createDefaultDayPlan(presets)
  if (!isObject(raw)) return defaults
  const date = str(raw.date)
  const dayStartTime = str(raw.dayStartTime)
  const selectedPresetIds = Array.isArray(raw.selectedPresetIds)
    ? [...new Set(raw.selectedPresetIds.filter((id): id is string => typeof id === 'string' && id !== ''))]
    : defaults.selectedPresetIds
  const customActivities = Array.isArray(raw.customActivities)
    ? raw.customActivities.map(parseActivityPreset).filter((a) => a !== null)
    : []
  const todoQueue = Array.isArray(raw.todoQueue)
    ? raw.todoQueue.map(parsePlannedTodo).filter((t) => t !== null)
    : []
  const breakOverrides = parseBreakOverrides(raw.breakOverrides)
  const activityOverrides = parseActivityOverrides(raw.activityOverrides)
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : defaults.date,
    dayStartTime: HHMM.test(dayStartTime) ? dayStartTime : defaults.dayStartTime,
    selectedPresetIds,
    customActivities,
    todoQueue,
    ...(breakOverrides ? { breakOverrides } : {}),
    ...(activityOverrides ? { activityOverrides } : {}),
  }
}

/** Validates an unknown blob into PlannerData, or returns null if it isn't one. */
export function parsePlannerData(raw: unknown): PlannerData | null {
  if (!isObject(raw) || !Array.isArray(raw.subjects)) return null
  const defaults = createDefaultData()
  const settings = isObject(raw.settings) ? raw.settings : {}
  const start = str(settings.semesterStartDate)
  const activityPresets = Array.isArray(raw.activityPresets)
    ? raw.activityPresets.map(parseActivityPreset).filter((a) => a !== null)
    : defaults.activityPresets
  const presets = activityPresets.length > 0 ? activityPresets : defaults.activityPresets
  return {
    version: 1,
    settings: {
      semesterStartDate: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : defaults.settings.semesterStartDate,
      weekCount: WEEK_COUNT,
    },
    subjects: raw.subjects.map(parseSubject).filter((s) => s !== null),
    studySessions: Array.isArray(raw.studySessions)
      ? raw.studySessions.map(parseStudySession).filter((s) => s !== null)
      : [],
    activeStudy: parseActiveStudy(raw.activeStudy),
    activityPresets: presets,
    dayPlan: parseDayPlan(raw.dayPlan, presets),
  }
}

export function loadData(): PlannerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultData()
    return parsePlannerData(JSON.parse(raw)) ?? createDefaultData()
  } catch {
    return createDefaultData()
  }
}

export function saveData(data: PlannerData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Quota exceeded or storage disabled; the in-memory state remains usable.
  }
}
