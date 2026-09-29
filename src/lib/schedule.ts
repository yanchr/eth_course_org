import { DAYS, WEEKEND_DAYS, type Day, type ScheduleSlot, type SlotType, type Subject } from '../types'
import { parseTimeRange } from './semester'

export const SLOT_LABEL: Record<SlotType, string> = {
  lecture: 'Lecture',
  exercise: 'Exercise',
  summary: 'Summary',
}

export const DAY_LABEL: Record<Day, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
}

/** The progress category a slot contributes to, matched loosely ("Exercises" ~ exercise). */
export function categoryForSlot(subject: Subject, type: SlotType): string | null {
  return subject.categories.find((c) => c.toLowerCase().startsWith(type.slice(0, 5))) ?? null
}

export interface PlacedSlot {
  subject: Subject
  slot: ScheduleSlot
}

const startMinutes = (slot: ScheduleSlot) => parseTimeRange(slot.time)?.start ?? Number.MAX_SAFE_INTEGER

export function slotsForDay(subjects: Subject[], day: Day): PlacedSlot[] {
  return subjects
    .flatMap((subject) => subject.scheduleSlots.filter((s) => s.day === day).map((slot) => ({ subject, slot })))
    .sort((a, b) => startMinutes(a.slot) - startMinutes(b.slot))
}

export function sortSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  return [...slots].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || startMinutes(a) - startMinutes(b))
}

/** Columns for the weekly grid: Mon–Fri always, a weekend day only once something is scheduled on it. */
export function timetableDays(subjects: Subject[]): Day[] {
  return DAYS.filter(
    (day) =>
      !WEEKEND_DAYS.includes(day) ||
      subjects.some((subject) => subject.scheduleSlots.some((slot) => slot.day === day)),
  )
}

export function formatMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
