export type SlotType = 'lecture' | 'exercise' | 'summary'
export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
export type ProgressState = 'pending' | 'completed' | 'canceled'
export type Campus = 'zentrum' | 'hoenggerberg'

export interface ScheduleSlot {
  id: string
  type: SlotType
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

export interface Subject {
  id: string
  name: string
  lecturer: string
  links: SubjectLink[]
  scheduleSlots: ScheduleSlot[]
  categories: string[]
  /** keyed by `${weekNumber}-${category}` */
  progress: Record<string, ProgressState>
  /** When set, this is a one-off event that only exists in that semester week. */
  onceWeek?: number
  /** Calendar-only: shows on the timetable, never in to-dos or completion counts. */
  calendarOnly?: boolean
}

export interface Settings {
  semesterStartDate: string
  weekCount: number
}

export interface PlannerData {
  version: 1
  settings: Settings
  subjects: Subject[]
}

export const DAYS: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKEND_DAYS: Day[] = ['Sat', 'Sun']
export const SLOT_TYPES: SlotType[] = ['lecture', 'exercise', 'summary']
export const DEFAULT_CATEGORIES = ['Lecture', 'Exercise', 'Summary']
export const WEEK_COUNT = 14
