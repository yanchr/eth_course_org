import {
  DAYS,
  DEFAULT_CATEGORIES,
  SLOT_TYPES,
  WEEK_COUNT,
  type PlannerData,
  type ProgressState,
  type ScheduleSlot,
  type Subject,
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
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const PROGRESS_STATES: ProgressState[] = ['pending', 'completed', 'canceled']

function parseLink(raw: unknown): SubjectLink | null {
  if (!isObject(raw)) return null
  const url = str(raw.url).trim()
  if (!url) return null
  return { id: str(raw.id) || createId(), label: str(raw.label) || url, url }
}

function parseSlot(raw: unknown): ScheduleSlot | null {
  if (!isObject(raw)) return null
  const type = SLOT_TYPES.find((t) => t === raw.type)
  const day = DAYS.find((d) => d === raw.day)
  if (!type || !day) return null
  return { id: str(raw.id) || createId(), type, day, time: str(raw.time), room: str(raw.room) }
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

  return {
    id: str(raw.id) || createId(),
    name,
    lecturer: str(raw.lecturer),
    links: Array.isArray(raw.links) ? raw.links.map(parseLink).filter((l) => l !== null) : [],
    scheduleSlots: Array.isArray(raw.scheduleSlots)
      ? raw.scheduleSlots.map(parseSlot).filter((s) => s !== null)
      : [],
    categories: categories.length ? categories : [...DEFAULT_CATEGORIES],
    progress,
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
