import { DAYS, WEEKEND_DAYS, type Day, type ScheduleSlot, type SlotType, type Subject } from '../types'
import { parseTimeRange } from './semester'
import { occursInWeek } from './subjects'

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

export interface LaidOutSlot extends PlacedSlot {
  start: number
  end: number
  lane: number
  lanes: number
}

/** Pack overlapping timed slots into lanes, the way a week calendar splits concurrent events. */
export function layoutDaySlots(items: PlacedSlot[]): LaidOutSlot[] {
  const timed: LaidOutSlot[] = items
    .map((item) => {
      const range = parseTimeRange(item.slot.time)
      return range ? { ...item, start: range.start, end: range.end, lane: 0, lanes: 1 } : null
    })
    .filter((item): item is LaidOutSlot => item !== null)
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const result: LaidOutSlot[] = []
  let cluster: LaidOutSlot[] = []
  let clusterEnd = -1

  const flush = () => {
    if (!cluster.length) return
    const laneEnds: number[] = []
    for (const event of cluster) {
      let lane = laneEnds.findIndex((end) => end <= event.start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(event.end)
      } else {
        laneEnds[lane] = event.end
      }
      event.lane = lane
    }
    const lanes = laneEnds.length
    for (const event of cluster) event.lanes = lanes
    result.push(...cluster)
    cluster = []
  }

  for (const event of timed) {
    if (cluster.length && event.start >= clusterEnd) flush()
    cluster.push(event)
    clusterEnd = Math.max(clusterEnd, event.end)
  }
  flush()
  return result
}

const startMinutes = (slot: ScheduleSlot) => parseTimeRange(slot.time)?.start ?? Number.MAX_SAFE_INTEGER

export function slotsForDay(subjects: Subject[], day: Day, week?: number): PlacedSlot[] {
  return subjects
    .filter((subject) => week == null || occursInWeek(subject, week))
    .flatMap((subject) => subject.scheduleSlots.filter((s) => s.day === day).map((slot) => ({ subject, slot })))
    .sort((a, b) => startMinutes(a.slot) - startMinutes(b.slot))
}

export function sortSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  return [...slots].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || startMinutes(a) - startMinutes(b))
}

/** Columns for the weekly grid: Mon–Fri always, a weekend day only once something is scheduled on it. */
export function timetableDays(subjects: Subject[], week?: number): Day[] {
  return DAYS.filter(
    (day) =>
      !WEEKEND_DAYS.includes(day) ||
      subjects.some(
        (subject) =>
          (week == null || occursInWeek(subject, week)) &&
          subject.scheduleSlots.some((slot) => slot.day === day),
      ),
  )
}