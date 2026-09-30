import { ChevronRight, MapPin } from 'lucide-react'
import type { Subject } from '../types'
import { usePlanner } from '../hooks/usePlannerStore'
import { getProgress, isWeekDone, weekStats } from '../lib/progress'
import { isOnce } from '../lib/subjects'
import { parseRoom } from '../lib/campus'
import { SLOT_LABEL, sortSlots } from '../lib/schedule'
import { CampusBadge } from './CampusBadge'
import { ProgressCell } from './ProgressCell'
import { cn } from '../lib/cn'

interface SubjectCardProps {
  subject: Subject
  week: number
  onOpen: (subject: Subject, slotId?: string) => void
}

export function SubjectCard({ subject, week, onOpen }: SubjectCardProps) {
  const { setProgress } = usePlanner()
  const stats = weekStats(subject, week)
  const slots = sortSlots(subject.scheduleSlots)
  const done = isWeekDone(subject, week)

  return (
    <article
      className={`overflow-hidden rounded-3xl border shadow-xs transition-colors duration-150 ease-out ${
        done ? 'border-zinc-200/70 bg-white/50' : 'border-zinc-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(subject)}
        className="flex w-full items-center gap-3 px-4 pt-4 pb-3 text-left transition-colors duration-150 ease-out hover:bg-zinc-50"
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold tracking-tight text-zinc-900">{subject.name}</h3>
          {subject.lecturer ? (
            <p className="truncate text-sm text-zinc-500">{subject.lecturer}</p>
          ) : isOnce(subject) ? (
            <p className="truncate text-sm text-zinc-500">Once · week {subject.onceWeek}</p>
          ) : null}
        </div>
        <span
          className={`tabular rounded-full px-2.5 py-1 text-xs font-semibold transition-colors duration-150 ease-out ${
            done ? 'bg-emerald-500/10 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
          }`}
        >
          {stats.completed}/{stats.total - stats.canceled}
        </span>
        <ChevronRight className="size-4 text-zinc-300" aria-hidden="true" />
      </button>

      <div
        className={cn(
          'grid gap-2 px-4 pb-4',
          subject.categories.length <= 1 ? 'grid-cols-1' : subject.categories.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
        )}
      >
        {subject.categories.map((category) => (
          <ProgressCell
            key={category}
            variant="card"
            label={category}
            state={getProgress(subject, week, category)}
            onChange={(next) => setProgress(subject.id, week, category, next)}
            context={`${subject.name}, ${category}, week ${week}`}
          />
        ))}
      </div>

      {slots.length > 0 && (
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
          {slots.map((slot) => {
            const loc = parseRoom(slot.room)
            return (
              <li key={slot.id}>
                <button
                  type="button"
                  onClick={() => onOpen(subject, slot.id)}
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors duration-150 ease-out hover:bg-zinc-50"
                >
                  <span className="flex w-16 shrink-0 flex-col leading-tight">
                    <span className="text-xs font-semibold text-zinc-900">{slot.day}</span>
                    <span className="text-[11px] text-zinc-400">{isOnce(subject) ? 'Once' : SLOT_LABEL[slot.type]}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="tabular truncate text-zinc-700">{slot.time || '—'}</span>
                    {loc && (
                      <span className="flex items-center gap-1 truncate text-xs text-zinc-500">
                        <MapPin className="size-3 shrink-0 text-zinc-400" aria-hidden="true" />
                        {slot.room}
                      </span>
                    )}
                  </span>
                  {loc && <CampusBadge campus={loc.campus} compact />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}
