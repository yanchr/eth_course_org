import { DEFAULT_CATEGORIES, type ScheduleSlot, type Subject, type SubjectEvent } from '../types'
import { createId } from './id'

export function occursInWeek(subject: Subject, week: number): boolean {
  return subject.onceWeek == null || subject.onceWeek === week
}

export function isOnce(subject: Subject): boolean {
  return subject.onceWeek != null
}

export function isCalendar(subject: Subject): boolean {
  return subject.calendarOnly === true
}

export function isTracked(subject: Subject): boolean {
  return !subject.calendarOnly
}

/** Weekly categories, plus single to-dos that belong to this week. */
export function categoriesInWeek(subject: Subject, week: number): string[] {
  if (!isTracked(subject) || !occursInWeek(subject, week)) return []
  const names = [...subject.categories]
  for (const event of subject.events ?? []) {
    if (event.week !== week || !event.name) continue
    if (names.some((c) => c.toLowerCase() === event.name.toLowerCase())) continue
    names.push(event.name)
  }
  return names
}

/** Repeating slots, plus slots from single events in this week. */
export function slotsInWeek(subject: Subject, week: number): ScheduleSlot[] {
  if (!occursInWeek(subject, week)) return []
  return [
    ...subject.scheduleSlots,
    ...(subject.events ?? []).filter((event) => event.week === week).flatMap((event) => event.slots),
  ]
}

export function eventForSlot(subject: Subject, slotId: string): SubjectEvent | undefined {
  return (subject.events ?? []).find((event) => event.slots.some((slot) => slot.id === slotId))
}

export function withEvent(subject: Subject, event: SubjectEvent): Subject {
  return { ...subject, events: [...(subject.events ?? []), event] }
}

export function createSubject(name = '', lecturer = ''): Subject {
  return {
    id: createId(),
    name,
    lecturer,
    links: [],
    scheduleSlots: [],
    categories: [...DEFAULT_CATEGORIES],
    progress: {},
  }
}

export function createEvent(week: number): Subject {
  return {
    id: createId(),
    name: '',
    lecturer: '',
    links: [],
    scheduleSlots: [{ id: createId(), type: 'lecture', day: 'Mon', time: '', room: '' }],
    categories: ['Event'],
    progress: {},
    onceWeek: week,
  }
}

export function createCalendarItem(week: number): Subject {
  return {
    id: createId(),
    name: '',
    lecturer: '',
    links: [],
    scheduleSlots: [{ id: createId(), type: 'lecture', day: 'Mon', time: '', room: '' }],
    categories: [],
    progress: {},
    onceWeek: week,
    calendarOnly: true,
  }
}
