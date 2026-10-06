import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Check, MapPin } from 'lucide-react'
import { DAYS, WEEKEND_DAYS, type Day, type Subject } from '../types'
import { usePlanner } from '../hooks/usePlannerStore'
import { currentWeek, dateForDay, formatMinutes, parseTimeRange, rawWeekIndex, todayDay } from '../lib/semester'
import { categoryForSlot, DAY_LABEL, layoutDaySlots, slotLabel, slotsForDay } from '../lib/schedule'
import { getProgress, isWeekDone, weekStats } from '../lib/progress'
import { eventForSlot, isCalendar, isOnce, occursInWeek, slotsInWeek } from '../lib/subjects'
import { parseRoom } from '../lib/campus'
import { cn } from '../lib/cn'

interface WeeklyTimetableProps {
  week: number
  onOpen: (subject: Subject, slotId?: string) => void
  /** 2 = phone pager (today + tomorrow, swipe). 7 = full week. */
  daysVisible?: 2 | 7
  /** The week currently in view. Scrolling the strip updates it. */
  onWeekChange?: (week: number) => void
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

type Column = { week: number; day: Day }

/** Which semester week is sitting at the left of the full-week strip. */
function weekAtLeft(el: HTMLElement, gutter: number): number {
  const probe = el.getBoundingClientRect().left + gutter + 12
  let found = 1
  for (const panel of el.querySelectorAll<HTMLElement>('[data-week-panel]')) {
    if (panel.getBoundingClientRect().left <= probe) found = Number(panel.dataset.weekPanel) || found
  }
  return found
}

function weekFromPager(el: HTMLElement, weekCount: number): number {
  const dayW = el.clientWidth / PEEK
  if (dayW <= 0) return 1
  const index = Math.round(el.scrollLeft / dayW)
  return Math.min(weekCount, Math.max(1, Math.floor(index / DAYS.length) + 1))
}

export function WeeklyTimetable({ week, onOpen, daysVisible = 7, onWeekChange }: WeeklyTimetableProps) {
  const { subjects, settings } = usePlanner()
  const { weekCount, semesterStartDate } = settings
  const pager = daysVisible === 2
  const scrollerRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const verticalRef = useRef<HTMLDivElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const hourPx = useFitHourPx(frameRef, HEADER_H)
  const [pane, setPane] = useState(0)
  const [snapWeeks, setSnapWeeks] = useState(true)

  const raw = rawWeekIndex(semesterStartDate, weekCount)
  const inSemester = raw >= 1 && raw <= weekCount
  const todayWeek = currentWeek(semesterStartDate, weekCount)
  const today = inSemester ? todayDay() : null
  const now = useMinutesNow(inSemester)

  const columns = useMemo(() => {
    const list: Column[] = []
    for (let w = 1; w <= weekCount; w++) {
      for (const day of DAYS) list.push({ week: w, day })
    }
    return list
  }, [weekCount])

  const { startMin, endMin } = useMemo(() => {
    const ranges = subjects.flatMap((subject) =>
      [...subject.scheduleSlots, ...(subject.events ?? []).flatMap((event) => event.slots)]
        .map((slot) => parseTimeRange(slot.time))
        .filter((range) => range !== null),
    )
    return {
      startMin: Math.floor(Math.min(DEFAULT_START, ...ranges.map((range) => range.start)) / 60) * 60,
      endMin: Math.ceil(Math.max(DEFAULT_END, ...ranges.map((range) => range.end)) / 60) * 60,
    }
  }, [subjects])

  const unscheduledByWeek = useMemo(() => {
    const map = new Map<number, { subject: Subject; slot: Subject['scheduleSlots'][number] }[]>()
    for (let w = 1; w <= weekCount; w++) {
      const items = subjects
        .filter((subject) => occursInWeek(subject, w))
        .flatMap((subject) =>
          slotsInWeek(subject, w)
            .filter((slot) => !parseTimeRange(slot.time))
            .map((slot) => ({ subject, slot })),
        )
      map.set(w, items)
    }
    return map
  }, [subjects, weekCount])

  const allDayRows = Math.max(
    0,
    ...columns.map(
      ({ week: w, day }) => (unscheduledByWeek.get(w) ?? []).filter((item) => item.slot.day === day).length,
    ),
  )
  const allDayHeight = allDayRows > 0 ? 4 + 36 * allDayRows : 0

  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60)
  const height = ((endMin - startMin) / 60) * hourPx
  const nowTop = now !== null ? ((now - startMin) / 60) * hourPx : null
  const showNow = nowTop !== null && now !== null && now >= startMin && now <= endMin
  const dayCount = columns.length
  const pagerTrack = {
    width: `${((dayCount + 1) / PEEK) * 100}%`,
    gridTemplateColumns: `repeat(${dayCount + 1}, minmax(0, 1fr))`,
  }

  const weekRef = useRef(week)
  weekRef.current = week
  const onWeekChangeRef = useRef(onWeekChange)
  onWeekChangeRef.current = onWeekChange
  const alignedWeek = useRef<number | null>(null)
  const ready = useRef(false)
  const programmatic = useRef(false)
  const targetLeft = useRef<number | null>(null)
  const paneSeen = useRef(-1)

  const syncHeader = () => {
    const body = scrollerRef.current
    const head = headerScrollRef.current
    if (!body || !head || head.scrollLeft === body.scrollLeft) return
    head.scrollLeft = body.scrollLeft
  }

  const horizontalRef = pager ? scrollerRef : verticalRef

  useLayoutEffect(() => {
    if (pager) return
    const el = verticalRef.current
    if (!el) return
    const measure = () => {
      const gutter = gutterRef.current?.offsetWidth ?? 0
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const minWeek = 44 * rootPx
      const available = el.clientWidth - gutter
      const snap = el.clientWidth >= minWeek
      const next = Math.max(1, Math.round(snap ? available : minWeek - gutter))
      setPane((prev) => (prev === next ? prev : next))
      setSnapWeeks((prev) => (prev === snap ? prev : snap))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [pager])

  useEffect(() => {
    const el = horizontalRef.current
    if (!el) return
    const finishProgrammatic = () => {
      const target = targetLeft.current
      if (target == null || Math.abs(el.scrollLeft - target) > 3) return
      programmatic.current = false
      targetLeft.current = null
    }
    const onScroll = () => {
      if (pager) syncHeader()
      if (!ready.current || programmatic.current) {
        if (programmatic.current) finishProgrammatic()
        return
      }
      const visible = pager ? weekFromPager(el, weekCount) : weekAtLeft(el, gutterRef.current?.offsetWidth ?? 0)
      alignedWeek.current = visible
      if (visible !== weekRef.current) onWeekChangeRef.current?.(visible)
    }
    const onPointerDown = () => {
      programmatic.current = false
      targetLeft.current = null
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('scrollend', finishProgrammatic)
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('scrollend', finishProgrammatic)
    }
  }, [horizontalRef, pager, weekCount])

  useLayoutEffect(() => {
    const el = horizontalRef.current
    if (!el) return
    if (!pager && pane <= 0) return
    if (paneSeen.current !== pane) {
      paneSeen.current = pane
      alignedWeek.current = null
    }
    if (alignedWeek.current === week) {
      ready.current = true
      return
    }

    const behavior: ScrollBehavior = alignedWeek.current == null ? 'auto' : 'smooth'
    alignedWeek.current = week
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    let left = 0
    if (pager) {
      const dayW = el.clientWidth / PEEK
      if (dayW <= 0) {
        alignedWeek.current = null
        return
      }
      const dayOffset = week === todayWeek && today ? DAYS.indexOf(today) : 0
      left = ((week - 1) * DAYS.length + dayOffset) * dayW
    } else {
      const panel = el.querySelector<HTMLElement>(`[data-week-panel="${week}"]`)
      if (!panel) {
        alignedWeek.current = null
        return
      }
      const gutter = gutterRef.current?.offsetWidth ?? 0
      const delta = panel.getBoundingClientRect().left - el.getBoundingClientRect().left - gutter
      left = el.scrollLeft + delta
    }
    left = Math.min(max, Math.max(0, left))
    ready.current = true
    if (Math.abs(el.scrollLeft - left) <= 3) return
    programmatic.current = behavior === 'smooth'
    targetLeft.current = behavior === 'smooth' ? left : null
    el.scrollTo({ left, top: el.scrollTop, behavior })
    if (pager) syncHeader()
  }, [horizontalRef, pager, pane, week, weekCount, today, todayWeek])

  useLayoutEffect(() => {
    const el = verticalRef.current
    const frame = frameRef.current
    if (!el || !frame || frame.clientHeight === 0) return
    const allDayH = el.querySelector<HTMLElement>('[data-all-day]')?.offsetHeight ?? 0
    const offset = Math.max(0, (DEFAULT_START - startMin) / 60) * hourPx
    const top = allDayH + offset
    if (Math.abs(el.scrollTop - top) <= 1) return
    el.scrollTop = top
  }, [pager, startMin, hourPx, allDayHeight])

  const scrollStrip = (left: number) => {
    const el = horizontalRef.current
    if (!el) return
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    const next = Math.min(max, Math.max(0, left))
    programmatic.current = false
    targetLeft.current = null
    el.scrollTo({ left: next, top: el.scrollTop, behavior: 'smooth' })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = horizontalRef.current
    if (!el) return
    if (pager) {
      const dayW = el.clientWidth / PEEK
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        scrollStrip(el.scrollLeft + dayW)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        scrollStrip(el.scrollLeft - dayW)
      } else if (e.key === 'Home') {
        e.preventDefault()
        onWeekChange?.(1)
      } else if (e.key === 'End') {
        e.preventDefault()
        onWeekChange?.(weekCount)
      }
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      onWeekChange?.(Math.min(weekCount, week + 1))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onWeekChange?.(Math.max(1, week - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onWeekChange?.(1)
    } else if (e.key === 'End') {
      e.preventDefault()
      onWeekChange?.(weekCount)
    }
  }

  const isToday = (column: Column) => column.day === today && column.week === todayWeek

  if (pager) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="shrink-0 px-1 text-xs text-zinc-500">Swipe through the semester</p>
        <div ref={frameRef} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
          <div className="flex shrink-0 border-b border-zinc-100">
            <div className="shrink-0 border-r border-zinc-100 bg-white" style={{ width: GUTTER }} />
            <div ref={headerScrollRef} className="scrollbar-none min-w-0 flex-1 overflow-hidden">
              <div className="grid" style={pagerTrack}>
                {columns.map((column) => (
                  <DayHeader
                    key={`${column.week}-${column.day}`}
                    day={column.day}
                    today={isToday(column) ? column.day : null}
                    date={dateForDay(semesterStartDate, column.week, column.day)}
                    kicker={column.day === 'Mon' ? `W${column.week}` : undefined}
                    edge={column.day === 'Mon' && column.week > 1}
                  />
                ))}
                <div aria-hidden="true" className="border-l border-zinc-100 bg-zinc-50" />
              </div>
            </div>
          </div>
          <div ref={verticalRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex">
              <div className="shrink-0 border-r border-zinc-100 bg-white" style={{ width: GUTTER }}>
                {allDayHeight > 0 && (
                  <div
                    data-all-day
                    className="flex items-center justify-end px-1.5 text-[9px] font-medium tracking-wide text-zinc-400 uppercase"
                    style={{ height: allDayHeight }}
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
                aria-label={`Semester schedule, two days at a time, weeks 1 to ${weekCount}. Swipe sideways to move through the semester.`}
                onKeyDown={onKeyDown}
                className="scrollbar-none min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900"
              >
                <div className="grid" style={pagerTrack}>
                  {columns.map((column) => (
                    <DayPane
                      key={`${column.week}-${column.day}`}
                      day={column.day}
                      week={column.week}
                      today={isToday(column) ? column.day : null}
                      hours={hours}
                      startMin={startMin}
                      height={height}
                      hourPx={hourPx}
                      subjects={subjects}
                      unscheduled={unscheduledByWeek.get(column.week) ?? []}
                      nowTop={isToday(column) && showNow ? nowTop : null}
                      snap
                      edge={column.day === 'Mon' && column.week > 1}
                      allDayHeight={allDayHeight}
                      onOpen={onOpen}
                    />
                  ))}
                  <div aria-hidden="true" className="snap-start border-l border-zinc-100 bg-zinc-50/40" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const weekStyle = { width: pane > 0 ? pane : undefined, minWidth: 'calc(44rem - 3.25rem)' }

  return (
    <div ref={frameRef} className="flex min-h-0 flex-1 flex-col">
      <div
        ref={verticalRef}
        tabIndex={0}
        role="region"
        aria-label={`Semester schedule, weeks 1 to ${weekCount}. Swipe sideways to move between weeks.`}
        onKeyDown={onKeyDown}
        style={{ scrollPaddingLeft: GUTTER }}
        className={cn(
          'min-h-0 flex-1 overflow-auto overscroll-contain rounded-2xl border border-zinc-200 bg-white shadow-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900',
          snapWeeks && 'snap-x snap-mandatory',
        )}
      >
        <div className="sticky top-0 z-20 flex w-max border-b border-zinc-200 bg-white">
          <div ref={gutterRef} className="sticky left-0 z-30 shrink-0 bg-white" style={{ width: GUTTER }} />
          {Array.from({ length: weekCount }, (_, i) => i + 1).map((w) => (
            <div key={w} className="grid shrink-0 grid-cols-7" style={{ ...weekStyle, gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
              {DAYS.map((day) => (
                <DayHeader
                  key={day}
                  day={day}
                  today={isToday({ week: w, day }) ? day : null}
                  date={dateForDay(semesterStartDate, w, day)}
                  kicker={day === 'Mon' ? `W${w}` : undefined}
                  edge={day === 'Mon' && w > 1}
                />
              ))}
            </div>
          ))}
        </div>
        {allDayHeight > 0 && (
          <div data-all-day className="flex w-max">
            <div
              className="sticky left-0 z-10 flex shrink-0 items-center justify-end bg-white px-2 text-[10px] font-medium tracking-wide text-zinc-400 uppercase"
              style={{ width: GUTTER }}
            >
              All day
            </div>
            {Array.from({ length: weekCount }, (_, i) => i + 1).map((w) => (
              <div key={w} className="grid shrink-0 grid-cols-7" style={{ ...weekStyle, gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {DAYS.map((day) => (
                  <AllDayLane
                    key={day}
                    day={day}
                    today={isToday({ week: w, day }) ? day : null}
                    items={(unscheduledByWeek.get(w) ?? []).filter((item) => item.slot.day === day)}
                    edge={day === 'Mon' && w > 1}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="flex w-max">
          <div className="relative sticky left-0 z-10 shrink-0 bg-white" style={{ width: GUTTER, height }}>
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
          {Array.from({ length: weekCount }, (_, i) => i + 1).map((w) => (
            <div
              key={w}
              data-week-panel={w}
              className="grid shrink-0 snap-start grid-cols-7"
              style={{ ...weekStyle, height, gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
            >
              {DAYS.map((day) => (
                <DayBody
                  key={day}
                  day={day}
                  week={w}
                  today={isToday({ week: w, day }) ? day : null}
                  hours={hours}
                  startMin={startMin}
                  hourPx={hourPx}
                  height={height}
                  subjects={subjects}
                  nowTop={isToday({ week: w, day }) && showNow ? nowTop : null}
                  edge={day === 'Mon' && w > 1}
                  onOpen={onOpen}
                />
              ))}
            </div>
          ))}
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
  edge,
  allDayHeight,
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
  edge?: boolean
  allDayHeight?: number
  onOpen: (subject: Subject, slotId?: string) => void
}) {
  return (
    <div className={cn('flex min-w-0 flex-col', snap && 'snap-start')}>
      {(allDayHeight ?? 0) > 0 && (
        <AllDayLane
          day={day}
          today={today}
          items={unscheduled.filter(({ slot }) => slot.day === day)}
          edge={edge}
          minHeight={allDayHeight}
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
        edge={edge}
        onOpen={onOpen}
      />
    </div>
  )
}

function DayHeader({
  day,
  today,
  date,
  kicker,
  edge,
}: {
  day: Day
  today: Day | null
  date: Date
  kicker?: string
  edge?: boolean
}) {
  const isToday = day === today
  return (
    <div
      className={cn(
        'flex h-12 flex-col items-center justify-center gap-0.5 border-l',
        edge ? 'border-zinc-300' : 'border-zinc-100',
        WEEKEND_DAYS.includes(day) ? 'bg-zinc-50' : 'bg-white',
        isToday && 'bg-zinc-50',
      )}
    >
      <span
        className={cn(
          'max-w-full truncate px-1 text-[10px] font-medium tracking-wide uppercase',
          isToday ? 'text-zinc-900' : 'text-zinc-400',
        )}
      >
        {kicker ? `${kicker} · ${day}` : day}
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
  edge,
  minHeight,
  onOpen,
}: {
  day: Day
  today: Day | null
  items: { subject: Subject; slot: Subject['scheduleSlots'][number] }[]
  edge?: boolean
  minHeight?: number
  onOpen: (subject: Subject, slotId?: string) => void
}) {
  return (
    <div
      className={cn(
        'flex min-h-10 flex-col justify-center gap-1 border-t border-l px-1 py-1',
        edge ? 'border-l-zinc-300' : 'border-l-zinc-100',
        'border-t-zinc-100',
        WEEKEND_DAYS.includes(day) && 'bg-zinc-50/80',
        day === today && 'bg-zinc-50',
      )}
      style={minHeight ? { height: minHeight, minHeight } : undefined}
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
  edge,
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
  edge?: boolean
  onOpen: (subject: Subject, slotId?: string) => void
}) {
  return (
    <div
      className={cn(
        'relative min-w-0 border-l',
        edge ? 'border-zinc-300' : 'border-zinc-100',
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
        const attached = eventForSlot(subject, slot.id)
        const category = attached?.name ?? categoryForSlot(subject, slot.type, slot.id)
        const state = !calendar && category ? getProgress(subject, week, category) : 'pending'
        const stats = weekStats(subject, week)
        const done = !calendar && isWeekDone(subject, week)
        const ratio = calendar ? 0 : done ? 1 : stats.ratio
        const loc = parseRoom(slot.room)
        const inset = 3
        const kind = attached
          ? attached.name
          : calendar
            ? 'calendar'
            : isOnce(subject)
              ? 'Once'
              : slotLabel(slot.type)
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
                : `${subject.name} ${isOnce(subject) ? 'once' : slotLabel(slot.type)}, ${DAY_LABEL[day]} ${slot.time}${slot.room ? `, ${slot.room}` : ''}, ${stats.completed} of ${stats.total - stats.canceled} done this week`
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
