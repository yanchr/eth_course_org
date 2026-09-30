import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Check, MapPin } from 'lucide-react'
import { DAYS, WEEKEND_DAYS, type Day, type Subject } from '../types'
import { usePlanner } from '../hooks/usePlannerStore'
import { dateForDay, formatMinutes, parseTimeRange, todayDay } from '../lib/semester'
import { categoryForSlot, DAY_LABEL, layoutDaySlots, SLOT_LABEL, slotsForDay } from '../lib/schedule'
import { getProgress, isWeekDone, weekStats } from '../lib/progress'
import { isCalendar, isOnce, occursInWeek } from '../lib/subjects'
import { parseRoom } from '../lib/campus'
import { cn } from '../lib/cn'

interface WeeklyTimetableProps {
  week: number
  isCurrentWeek: boolean
  onOpen: (subject: Subject, slotId?: string) => void
  /** 2 = phone pager (today + tomorrow, swipe). 7 = full week. */
  daysVisible?: 2 | 7
}

const DEFAULT_START = 8 * 60
const DEFAULT_END = 18 * 60
const VISIBLE_HOURS = (DEFAULT_END - DEFAULT_START) / 60
const HOUR_PX_MIN = 36
const HOUR_PX_MAX = 56
const HEADER_H = 48
const GUTTER = '3.25rem'
const PEEK = 2

const minutesNow = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function useMinutesNow(enabled: boolean): number | null {
  const [now, setNow] = useState(minutesNow)
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => setNow(minutesNow()), 60_000)
    return () => window.clearInterval(id)
  }, [enabled])
  return enabled ? now : null
}

/** Hour height that keeps 08:00–18:00 inside the timetable viewport. */
function useFitHourPx(ref: RefObject<HTMLDivElement | null>, reservedPx: number): number {
  const [px, setPx] = useState(48)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const available = el.clientHeight - reservedPx
      if (available <= 0) return
      const next = Math.min(HOUR_PX_MAX, Math.max(HOUR_PX_MIN, Math.floor(available / VISIBLE_HOURS)))
      setPx((prev) => (prev === next ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, reservedPx])
  return px
}

export function WeeklyTimetable({ week, isCurrentWeek, onOpen, daysVisible = 7 }: WeeklyTimetableProps) {
  const { subjects, settings } = usePlanner()
  const today = isCurrentWeek ? todayDay() : null
  const now = useMinutesNow(isCurrentWeek)
  const pager = daysVisible === 2
  const scrollerRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const verticalRef = useRef<HTMLDivElement>(null)
  const hourPx = useFitHourPx(frameRef, HEADER_H)

  const weekSubjects = subjects.filter((s) => occursInWeek(s, week))
  const ranges = weekSubjects.flatMap((s) => s.scheduleSlots.map((slot) => parseTimeRange(slot.time))).filter((r) => r !== null)
  const startMin = Math.floor(Math.min(DEFAULT_START, ...ranges.map((r) => r.start)) / 60) * 60
  const endMin = Math.ceil(Math.max(DEFAULT_END, ...ranges.map((r) => r.end)) / 60) * 60
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60)
  const height = ((endMin - startMin) / 60) * hourPx
  const unscheduled = weekSubjects.flatMap((subject) =>
    subject.scheduleSlots.filter((slot) => !parseTimeRange(slot.time)).map((slot) => ({ subject, slot })),
  )
  const nowTop = now !== null ? ((now - startMin) / 60) * hourPx : null
  const showNow = nowTop !== null && now !== null && now >= startMin && now <= endMin

  const startIndex = (() => {
    const idx = today ? DAYS.indexOf(today) : 0
    return Math.max(0, idx)
  })()

  const syncHeader = () => {
    const body = scrollerRef.current
    const head = headerScrollRef.current
    if (!body || !head || head.scrollLeft === body.scrollLeft) return
    head.scrollLeft = body.scrollLeft
  }

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!pager || !el) return
    const dayW = el.clientWidth / PEEK
    el.scrollLeft = startIndex * dayW
    syncHeader()
  }, [pager, week, startIndex])

  useLayoutEffect(() => {
    const el = verticalRef.current
    const frame = frameRef.current
    if (!el || !frame || frame.clientHeight === 0) return
    const allDayH = el.querySelector<HTMLElement>('[data-all-day]')?.offsetHeight ?? 0
    const offset = Math.max(0, (DEFAULT_START - startMin) / 60) * hourPx
    el.scrollTop = allDayH + offset
  }, [week, pager, startMin, hourPx])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!pager) return
    const el = scrollerRef.current
    if (!el) return
    const dayW = el.clientWidth / PEEK
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      el.scrollBy({ left: dayW, behavior: 'smooth' })
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      el.scrollBy({ left: -dayW, behavior: 'smooth' })
    } else if (e.key === 'Home') {
      e.preventDefault()
      el.scrollTo({ left: 0, behavior: 'smooth' })
    } else if (e.key === 'End') {
      e.preventDefault()
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
    }
  }

  const allDay = unscheduled.length > 0

  const dayColumns = DAYS.map((day) => (
    <DayPane
      key={day}
      day={day}
      week={week}
      today={today}
      hours={hours}
      startMin={startMin}
      height={height}
      hourPx={hourPx}
      subjects={subjects}
      unscheduled={unscheduled}
      nowTop={day === today && showNow ? nowTop : null}
      snap={pager}
      onOpen={onOpen}
    />
  ))

  const pagerTrack = {
    width: `${((DAYS.length + 1) / PEEK) * 100}%`,
    gridTemplateColumns: `repeat(${DAYS.length + 1}, minmax(0, 1fr))`,
  }

  if (pager) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2" onKeyDown={onKeyDown}>
        <p className="shrink-0 px-1 text-xs text-zinc-500">Swipe to see other days</p>
        <div ref={frameRef} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
          <div className="flex shrink-0 border-b border-zinc-100">
            <div className="shrink-0 border-r border-zinc-100 bg-white" style={{ width: GUTTER }} />
            <div ref={headerScrollRef} className="scrollbar-none min-w-0 flex-1 overflow-hidden">
              <div className="grid" style={pagerTrack}>
                {DAYS.map((day) => (
                  <DayHeader
                    key={day}
                    day={day}
                    today={today}
                    date={dateForDay(settings.semesterStartDate, week, day)}
                  />
                ))}
                <div aria-hidden="true" className="border-l border-zinc-100 bg-zinc-50" />
              </div>
            </div>
          </div>
          <div ref={verticalRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex">
              <div className="shrink-0 border-r border-zinc-100 bg-white" style={{ width: GUTTER }}>
                {allDay && (
                  <div
                    data-all-day
                    className="flex h-10 items-center justify-end px-1.5 text-[9px] font-medium tracking-wide text-zinc-400 uppercase"
                  >
                    All day
                  </div>
                )}
                <div className="relative" style={{ height }}>
                  {hours.map((h, i) =>
                    i === 0 ? null : (
                      <span
                        key={h}
                        className="tabular absolute right-1.5 -translate-y-1/2 text-[10px] text-zinc-400"
                        style={{ top: i * hourPx }}
                      >
                        {formatMinutes(h)}
                      </span>
                    ),
                  )}
                </div>
              </div>
              <div
                ref={scrollerRef}
                tabIndex={0}
                role="region"
                aria-label="Week schedule, two days at a time. Swipe or use arrow keys for other days."
                onScroll={syncHeader}
                className="scrollbar-none min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain outline-none"
              >
                <div className="grid" style={pagerTrack}>
                  {dayColumns}
                  <div aria-hidden="true" className="snap-start border-l border-zinc-100 bg-zinc-50/40" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const columns = { gridTemplateColumns: `${GUTTER} repeat(7, minmax(0, 1fr))` }

  return (
    <div ref={frameRef} className="flex min-h-0 flex-1 flex-col">
      <div
        ref={verticalRef}
        className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-2xl border border-zinc-200 bg-white shadow-xs"
      >
        <div className="min-w-[44rem]">
          <div className="sticky top-0 z-20 grid bg-white" style={columns}>
            <div className="sticky left-0 z-30 bg-white" />
            {DAYS.map((day) => (
              <DayHeader
                key={day}
                day={day}
                today={today}
                date={dateForDay(settings.semesterStartDate, week, day)}
              />
            ))}
          </div>
          {allDay && (
            <div data-all-day className="grid border-t border-zinc-200" style={columns}>
              <div className="sticky left-0 z-10 flex items-center justify-end bg-white px-2 py-2 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
                All day
              </div>
              {DAYS.map((day) => (
                <AllDayLane
                  key={day}
                  day={day}
                  today={today}
                  items={unscheduled.filter(({ slot }) => slot.day === day)}
                  onOpen={onOpen}
                />
              ))}
            </div>
          )}
          <div className="relative grid border-t border-zinc-200" style={{ ...columns, height }}>
            <div className="relative sticky left-0 z-10 bg-white">
              {hours.map((h, i) =>
                i === 0 ? null : (
                  <span
                    key={h}
                    className="tabular absolute right-2 -translate-y-1/2 text-[11px] text-zinc-400"
                    style={{ top: i * hourPx }}
                  >
                    {formatMinutes(h)}
                  </span>
                ),
              )}
            </div>
            {DAYS.map((day) => (
              <DayBody
                key={day}
                day={day}
                week={week}
                today={today}
                hours={hours}
                startMin={startMin}
                hourPx={hourPx}
                height={height}
                subjects={subjects}
                nowTop={day === today && showNow ? nowTop : null}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DayPane({
  day,
  week,
  today,
  hours,
  startMin,
  hourPx,
  height,
  subjects,
  unscheduled,
  nowTop,
  snap,
  onOpen,
}: {
  day: Day
  week: number
  today: Day | null
  hours: number[]
  startMin: number
  hourPx: number
  height: number
  subjects: Subject[]
  unscheduled: { subject: Subject; slot: Subject['scheduleSlots'][number] }[]
  nowTop: number | null
  snap: boolean
  onOpen: (subject: Subject, slotId?: string) => void
}) {
  return (
    <div className={cn('flex min-w-0 flex-col', snap && 'snap-start')}>
      {unscheduled.length > 0 && (
        <AllDayLane
          day={day}
          today={today}
          items={unscheduled.filter(({ slot }) => slot.day === day)}
          onOpen={onOpen}
        />
      )}
      <DayBody
        day={day}
        week={week}
        today={today}
        hours={hours}
        startMin={startMin}
        hourPx={hourPx}
        height={height}
        subjects={subjects}
        nowTop={nowTop}
        onOpen={onOpen}
      />
    </div>
  )
}

function DayHeader({ day, today, date }: { day: Day; today: Day | null; date: Date }) {
  const isToday = day === today
  return (
    <div
      className={cn(
        'flex h-12 flex-col items-center justify-center gap-0.5 border-l border-zinc-100',
        WEEKEND_DAYS.includes(day) ? 'bg-zinc-50' : 'bg-white',
        isToday && 'bg-zinc-50',
      )}
    >
      <span
        className={cn(
          'text-[10px] font-medium tracking-wide uppercase',
          isToday ? 'text-zinc-900' : 'text-zinc-400',
        )}
      >
        {day}
      </span>
      <span
        className={cn(
          'tabular inline-flex size-6 items-center justify-center rounded-full text-[13px] font-semibold',
          isToday ? 'bg-zinc-900 text-white' : 'text-zinc-700',
        )}
      >
        {date.getDate()}
      </span>
    </div>
  )
}

function AllDayLane({
  day,
  today,
  items,
  onOpen,
}: {
  day: Day
  today: Day | null
  items: { subject: Subject; slot: Subject['scheduleSlots'][number] }[]
  onOpen: (subject: Subject, slotId?: string) => void
}) {
  return (
    <div
      className={cn(
        'flex min-h-10 flex-col justify-center gap-1 border-l border-t border-zinc-100 px-1 py-1',
        WEEKEND_DAYS.includes(day) && 'bg-zinc-50/80',
        day === today && 'bg-zinc-50',
      )}
    >
      {items.map(({ subject, slot }) => (
        <button
          key={slot.id}
          type="button"
          onClick={() => onOpen(subject, slot.id)}
          className={cn(
            'min-h-8 truncate rounded-md px-1.5 text-left text-[11px] font-medium',
            isCalendar(subject)
              ? 'bg-calendar text-calendar-ink'
              : 'bg-zinc-100 text-zinc-800',
          )}
        >
          {subject.name}
        </button>
      ))}
    </div>
  )
}

function DayBody({
  day,
  week,
  today,
  hours,
  startMin,
  hourPx,
  height,
  subjects,
  nowTop,
  onOpen,
}: {
  day: Day
  week: number
  today: Day | null
  hours: number[]
  startMin: number
  hourPx: number
  height: number
  subjects: Subject[]
  nowTop: number | null
  onOpen: (subject: Subject, slotId?: string) => void
}) {
  return (
    <div
      className={cn(
        'relative min-w-0 border-l border-zinc-100',
        WEEKEND_DAYS.includes(day) && 'bg-zinc-50/60',
        day === today && 'bg-zinc-50',
      )}
      style={{ height }}
    >
      {hours.map((h, i) =>
        i === 0 ? null : (
          <div key={h} className="absolute inset-x-0 border-t border-zinc-100" style={{ top: i * hourPx }} />
        ),
      )}
      {hours.map((h, i) =>
        i === 0 ? null : (
          <div
            key={`${h}-half`}
            className="absolute inset-x-0 border-t border-dashed border-zinc-100/80"
            style={{ top: i * hourPx - hourPx / 2 }}
          />
        ),
      )}
      {layoutDaySlots(slotsForDay(subjects, day, week)).map((event) => {
        const { subject, slot, start, end, lane, lanes } = event
        const top = ((start - startMin) / 60) * hourPx
        const blockHeight = Math.max(((end - start) / 60) * hourPx - 2, 26)
        const calendar = isCalendar(subject)
        const category = categoryForSlot(subject, slot.type)
        const state = !calendar && category ? getProgress(subject, week, category) : 'pending'
        const stats = weekStats(subject, week)
        const done = !calendar && isWeekDone(subject, week)
        const ratio = calendar ? 0 : done ? 1 : stats.ratio
        const loc = parseRoom(slot.room)
        const inset = 3
        const kind = calendar ? 'calendar' : isOnce(subject) ? 'Once' : SLOT_LABEL[slot.type]
        const face = (
          <EventFace
            name={subject.name}
            type={kind === 'calendar' ? '' : kind}
            time={`${formatMinutes(start)}–${formatMinutes(end)}`}
            room={slot.room}
            campus={loc?.campus === 'zentrum' ? 'Z' : loc ? 'H' : null}
            height={blockHeight}
            canceled={state === 'canceled'}
            done={done}
          />
        )
        return (
          <button
            key={slot.id}
            type="button"
            onClick={() => onOpen(subject, slot.id)}
            aria-label={
              calendar
                ? `${subject.name}, ${DAY_LABEL[day]} ${slot.time}${slot.room ? `, ${slot.room}` : ''}`
                : `${subject.name} ${isOnce(subject) ? 'once' : SLOT_LABEL[slot.type]}, ${DAY_LABEL[day]} ${slot.time}${slot.room ? `, ${slot.room}` : ''}, ${stats.completed} of ${stats.total - stats.canceled} done this week`
            }
            className={cn(
              'absolute overflow-hidden rounded-md border text-left',
              'transition-[border-color,box-shadow] duration-150 ease-out hover:shadow-md',
              calendar
                ? 'border-calendar-edge bg-calendar text-calendar-ink'
                : state === 'canceled'
                  ? 'border-dashed border-zinc-300 bg-white'
                  : done
                    ? 'border-zinc-900 bg-white'
                    : 'border-zinc-200 bg-white',
            )}
            style={{
              top: top + 1,
              height: blockHeight,
              left: `calc(${(lane / lanes) * 100}% + ${inset}px)`,
              width: `calc(${100 / lanes}% - ${inset * 2}px)`,
            }}
          >
            {!calendar && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 bg-zinc-900 transition-[height] duration-150 ease-out"
                style={{ height: `${ratio * 100}%` }}
              />
            )}
            <span className={cn('relative flex h-full flex-col', calendar ? 'text-calendar-ink' : 'text-zinc-900')}>
              {face}
            </span>
            {!calendar && ratio > 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex flex-col text-white"
                style={{ clipPath: `inset(${(1 - ratio) * 100}% 0 0 0)` }}
              >
                {face}
              </span>
            )}
          </button>
        )
      })}
      {nowTop !== null && (
        <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: nowTop }} aria-hidden="true">
          <div className="relative">
            <span className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rounded-full bg-zinc-900" />
            <div className="h-px bg-zinc-900" />
          </div>
        </div>
      )}
    </div>
  )
}

function EventFace({
  name,
  type,
  time,
  room,
  campus,
  height,
  canceled,
  done,
}: {
  name: string
  type: string
  time: string
  room: string
  campus: string | null
  height: number
  canceled: boolean
  done: boolean
}) {
  return (
    <>
      <span
        className={cn(
          'flex items-center gap-1 px-1.5 pt-1 text-[12px] leading-tight font-semibold',
          canceled && 'line-through opacity-50',
        )}
      >
        {done && <Check className="size-3 shrink-0" strokeWidth={3} />}
        <span className="truncate">{name}</span>
      </span>
      {height >= 32 && (
        <span className="truncate px-1.5 text-[10px] leading-tight opacity-60">
          {time}
          {height >= 48 && type ? ` · ${type}` : ''}
        </span>
      )}
      {height >= 64 && room && (
        <span className="mt-auto flex items-center gap-1 truncate px-1.5 pb-1 text-[10px] font-medium opacity-75">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{room}</span>
          {campus && <span className="opacity-70">{campus}</span>}
        </span>
      )}
    </>
  )
}
