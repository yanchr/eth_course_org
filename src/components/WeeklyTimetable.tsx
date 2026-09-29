import { Check, MapPin } from 'lucide-react'
import type { Subject } from '../types'
import { usePlanner } from '../hooks/usePlannerStore'
import { dateForDay, formatDayDate, parseTimeRange, todayDay } from '../lib/semester'
import { categoryForSlot, formatMinutes, SLOT_LABEL, slotsForDay, timetableDays } from '../lib/schedule'
import { getProgress } from '../lib/progress'
import { parseRoom } from '../lib/campus'
import { cn } from '../lib/cn'

interface WeeklyTimetableProps {
  week: number
  isCurrentWeek: boolean
  onOpen: (subject: Subject, slotId?: string) => void
}

const HOUR_PX = 52
const DEFAULT_START = 8 * 60
const DEFAULT_END = 18 * 60

export function WeeklyTimetable({ week, isCurrentWeek, onOpen }: WeeklyTimetableProps) {
  const { subjects, settings } = usePlanner()
  const today = isCurrentWeek ? todayDay() : null
  const days = timetableDays(subjects)
  const columns = { gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }

  const ranges = subjects.flatMap((s) => s.scheduleSlots.map((slot) => parseTimeRange(slot.time))).filter((r) => r !== null)
  const startMin = Math.floor(Math.min(DEFAULT_START, ...ranges.map((r) => r.start)) / 60) * 60
  const endMin = Math.ceil(Math.max(DEFAULT_END, ...ranges.map((r) => r.end)) / 60) * 60
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60)
  const height = ((endMin - startMin) / 60) * HOUR_PX
  const unscheduled = subjects.flatMap((subject) =>
    subject.scheduleSlots.filter((slot) => !parseTimeRange(slot.time)).map((slot) => ({ subject, slot })),
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
        <div className="grid border-b border-zinc-200" style={columns}>
          <div />
          {days.map((day) => {
            const isToday = day === today
            return (
              <div key={day} className="border-l border-zinc-100 px-2 py-2.5 text-center">
                <div className={cn('text-xs font-semibold', isToday ? 'text-zinc-900' : 'text-zinc-500')}>{day}</div>
                <div
                  className={cn(
                    'tabular mx-auto mt-0.5 inline-flex rounded-md px-1.5 text-[11px]',
                    isToday ? 'bg-zinc-900 text-white' : 'text-zinc-400',
                  )}
                >
                  {formatDayDate(dateForDay(settings.semesterStartDate, week, day))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="relative grid" style={{ ...columns, height }}>
          <div className="relative">
            {hours.map((h, i) => (
              <span
                key={h}
                className="tabular absolute right-2 -translate-y-1/2 text-[10px] text-zinc-400"
                style={{ top: i * HOUR_PX }}
              >
                {i === 0 ? '' : formatMinutes(h)}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div key={day} className={cn('relative border-l border-zinc-100', day === today && 'bg-zinc-50')}>
              {hours.map((h, i) =>
                i === 0 ? null : (
                  <div key={h} className="absolute inset-x-0 border-t border-zinc-100" style={{ top: i * HOUR_PX }} />
                ),
              )}
              {slotsForDay(subjects, day).map(({ subject, slot }) => {
                const range = parseTimeRange(slot.time)
                if (!range) return null
                const top = ((range.start - startMin) / 60) * HOUR_PX
                const blockHeight = ((range.end - range.start) / 60) * HOUR_PX
                const category = categoryForSlot(subject, slot.type)
                const state = category ? getProgress(subject, week, category) : 'pending'
                const loc = parseRoom(slot.room)
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => onOpen(subject, slot.id)}
                    aria-label={`${subject.name} ${SLOT_LABEL[slot.type]}, ${day} ${slot.time}${slot.room ? `, ${slot.room}` : ''}${state !== 'pending' ? `, ${state}` : ''}`}
                    className={cn(
                      'absolute inset-x-1 flex flex-col overflow-hidden rounded-lg border px-2 py-1.5 text-left',
                      'transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:shadow-md',
                      state === 'completed'
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : state === 'canceled'
                          ? 'border-dashed border-zinc-300 bg-zinc-50 text-zinc-400'
                          : slot.type === 'lecture'
                            ? 'border-zinc-300 bg-white text-zinc-900'
                            : 'border-zinc-200 bg-zinc-100 text-zinc-900',
                    )}
                    style={{ top: top + 1, height: Math.max(blockHeight - 2, 26) }}
                  >
                    <span
                      className={cn(
                        'flex items-center gap-1 truncate text-xs font-semibold',
                        state === 'canceled' && 'line-through',
                      )}
                    >
                      {state === 'completed' && <Check className="size-3 shrink-0" strokeWidth={3} />}
                      <span className="truncate">{subject.name}</span>
                    </span>
                    {blockHeight >= 44 && (
                      <span className={cn('truncate text-[11px]', state === 'completed' ? 'text-zinc-400' : 'text-zinc-500')}>
                        {SLOT_LABEL[slot.type]}
                      </span>
                    )}
                    {blockHeight >= 64 && slot.room && (
                      <span
                        className={cn(
                          'mt-auto flex items-center gap-1 truncate text-[11px] font-medium',
                          state === 'completed' ? 'text-zinc-300' : 'text-zinc-600',
                        )}
                      >
                        <MapPin className="size-3 shrink-0" />
                        <span className="truncate">{slot.room}</span>
                        {loc && <span className="opacity-60">· {loc.campus === 'zentrum' ? 'Z' : 'H'}</span>}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <p className="px-1 text-xs text-zinc-500">
          {unscheduled.length} slot{unscheduled.length === 1 ? '' : 's'} without a parseable time (use e.g. 10:15-12:00):{' '}
          {unscheduled.map(({ subject, slot }) => `${subject.name} ${slot.day}`).join(', ')}
        </p>
      )}
    </div>
  )
}
