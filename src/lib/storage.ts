import {
  DAYS,
  DEFAULT_CATEGORIES,
  WEEK_COUNT,
  type ActiveStudy,
  type PlannerData,
  type ProgressState,
  type ScheduleSlot,
  type StudySession,
  type Subject,
  type SubjectEvent,
  type SubjectLink,
} from '../types'
import { createId } from './id'

export const STORAGE_KEY = 'eth-course-planner:v1'
export const DEFAULT_SEMESTER_START = '2026-09-14'

export function createDefaultData(): PlannerData {
  return {
    version: 1,
    settings: { semesterStartDate: DEFAULT_SEMESTER_START, weekCount: WEEK_COUNT },
    subjects: [],
    studySessions: [],
    activeStudy: null,
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

/** Validates an unknown blob into PlannerData, or returns null if it isn't one. */
export function parsePlannerData(raw: unknown): PlannerData | null {
  if (!isObject(raw) || !Array.isArray(raw.subjects)) return null
  const defaults = createDefaultData()
  const settings = isObject(raw.settings) ? raw.settings : {}
  const start = str(settings.semesterStartDate)
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
