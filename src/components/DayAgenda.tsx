import { Check, MapPin } from 'lucide-react'
import { DAYS, type Day, type Subject } from '../types'
import { usePlanner } from '../hooks/usePlannerStore'
import { dateForDay, formatDayDate } from '../lib/semester'
import { categoryForSlot, DAY_LABEL, SLOT_LABEL, slotsForDay } from '../lib/schedule'
import { getProgress } from '../lib/progress'
import { parseRoom } from '../lib/campus'
import { cn } from '../lib/cn'
import { SegmentedControl } from './layout/SegmentedControl'
import { CampusBadge } from './CampusBadge'

interface DayAgendaProps {
  week: number
  day: Day
  onDayChange: (day: Day) => void
  onOpen: (subject: Subject, slotId?: string) => void
}

export function DayAgenda({ week, day, onDayChange, onOpen }: DayAgendaProps) {
  const { subjects, settings } = usePlanner()
  const items = slotsForDay(subjects, day, week)

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="Day"
        value={day}
        onChange={onDayChange}
        options={DAYS.map((d) => ({ value: d, label: d, ariaLabel: DAY_LABEL[d] }))}
      />
      <p className="px-1 text-sm text-zinc-500">
        {DAY_LABEL[day]}, {formatDayDate(dateForDay(settings.semesterStartDate, week, day))}
      </p>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">
          Nothing scheduled.
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map(({ subject, slot }) => {
            const loc = parseRoom(slot.room)
            const category = categoryForSlot(subject, slot.type)
            const state = category ? getProgress(subject, week, category) : 'pending'
            return (
              <li key={slot.id}>
                <button
                  type="button"
                  onClick={() => onOpen(subject, slot.id)}
                  className={cn(
                    'flex w-full items-stretch gap-4 rounded-2xl border bg-white p-4 text-left shadow-xs',
                    'transition-colors duration-150 ease-out hover:border-zinc-300',
                    state === 'canceled' ? 'border-dashed border-zinc-300' : 'border-zinc-200',
                  )}
                >
                  <div className="tabular w-14 shrink-0 text-sm font-semibold text-zinc-900">
                    {slot.time.split(/\s*[-–]\s*/)[0] || '—'}
                    <div className="text-xs font-normal text-zinc-400">{slot.time.split(/\s*[-–]\s*/)[1] ?? ''}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        'flex items-center gap-1.5 truncate font-semibold text-zinc-900',
                        state === 'canceled' && 'text-zinc-400 line-through',
                      )}
                    >
                      {state === 'completed' && <Check className="size-4 shrink-0" strokeWidth={3} />}
                      <span className="truncate">{subject.name}</span>
                    </div>
                    <div className="text-sm text-zinc-500">{SLOT_LABEL[slot.type]}</div>
                    {loc && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1 text-sm font-medium text-zinc-700">
                          <MapPin className="size-3.5 text-zinc-400" />
                          {slot.room}
                        </span>
                        <CampusBadge campus={loc.campus} compact />
                      </div>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
