export type SlotType = 'lecture' | 'exercise' | 'summary'
export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
export type ProgressState = 'pending' | 'completed' | 'canceled'
export type Campus = 'zentrum' | 'hoenggerberg'

export interface ScheduleSlot {
  id: string
  /** "lecture" | "exercise" | "summary", or a custom label such as "Praktika". */
  type: string
  day: Day
  /** "HH:MM-HH:MM" or "HH:MM" */
  time: string
  room: string
}

export interface SubjectLink {
  id: string
  label: string
  url: string
}

/** A single event folded into a weekly subject: one to-do, and its slots, in one week. */
export interface SubjectEvent {
  id: string
  name: string
  week: number
  slots: ScheduleSlot[]
  links: SubjectLink[]
}

export interface Subject {
  id: string
  name: string
  lecturer: string
  links: SubjectLink[]
  scheduleSlots: ScheduleSlot[]
  categories: string[]
  /** keyed by `${weekNumber}-${category}` */
  progress: Record<string, ProgressState>
  /** One-off to-dos added onto this subject. Each exists only in its week. */
  events?: SubjectEvent[]
  /** When set, this is a one-off event that only exists in that semester week. */
  onceWeek?: number
  /** Calendar-only: shows on the timetable, never in to-dos or completion counts. */
  calendarOnly?: boolean
}

export interface Settings {
  semesterStartDate: string
  weekCount: number
}

export interface StudySession {
  id: string
  subjectId: string
  week: number
  /** Todos the time is split across; empty means the time only counts for the course. */
  categories: string[]
  /** Active study time; less than endedAt - startedAt when the session was paused. */
  durationMs: number
  startedAt: string
  endedAt: string
}

export interface ActiveStudy {
  subjectId: string
  week: number
  categories: string[]
  /** Epoch ms of the first start. */
  startedAt: number
  /** Active time banked before the current run. */
  accumulatedMs: number
  /** Epoch ms when the current run started; null while paused. */
  resumedAt: number | null
}

export interface PlannerData {
  version: 1
  settings: Settings
  subjects: Subject[]
  studySessions: StudySession[]
  activeStudy: ActiveStudy | null
}

export const DAYS: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKEND_DAYS: Day[] = ['Sat', 'Sun']
export const SLOT_TYPES: SlotType[] = ['lecture', 'exercise', 'summary']
export const DEFAULT_CATEGORIES = ['Lecture', 'Exercise', 'Summary']
export const WEEK_COUNT = 14
