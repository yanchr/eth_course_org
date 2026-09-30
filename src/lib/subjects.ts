import { DEFAULT_CATEGORIES, type Subject } from '../types'
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
