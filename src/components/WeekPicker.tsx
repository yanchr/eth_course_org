import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { WeekCompletion } from '../lib/progress'
import { cn } from '../lib/cn'
import { formatWeekRange } from '../lib/semester'

interface WeekPickerProps {
  weekCount: number
  selected: number
  todayWeek: number
  semesterStartDate: string
  /** completion per week, index 0 = week 1 */
  completion: WeekCompletion[]
  onSelect: (week: number) => void
  className?: string
}

export function WeekPicker({
  weekCount,
  selected,
  todayWeek,
  semesterStartDate,
  completion,
  onSelect,
  className,
}: WeekPickerProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-week="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [selected])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next = selected
    if (e.key === 'ArrowRight') next = Math.min(weekCount, selected + 1)
    else if (e.key === 'ArrowLeft') next = Math.max(1, selected - 1)
    else if (e.key === 'Home') next = 1
    else if (e.key === 'End') next = weekCount
    else return
    e.preventDefault()
    onSelect(next)
    listRef.current?.querySelector<HTMLElement>(`[data-week="${next}"]`)?.focus()
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        ref={listRef}
        role="radiogroup"
        aria-label="Semester week"
        onKeyDown={onKeyDown}
        className="scrollbar-none -mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 py-0.5"
      >
        {Array.from({ length: weekCount }, (_, i) => i + 1).map((week) => {
          const active = week === selected
          const isToday = week === todayWeek
          const { completed, scheduled, ratio } = completion[week - 1] ?? { completed: 0, scheduled: 0, ratio: 0 }
          const done = scheduled > 0 ? `${completed} of ${scheduled} done` : ''
          return (
            <button
              key={week}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={[
                `Week ${week}`,
                formatWeekRange(semesterStartDate, week),
                isToday ? 'current week' : '',
                done,
              ]
                .filter(Boolean)
                .join(', ')}
              title={[formatWeekRange(semesterStartDate, week), done].filter(Boolean).join(' · ')}
              tabIndex={active ? 0 : -1}
              data-week={week}
              onClick={() => onSelect(week)}
              className={cn(
                'tabular relative inline-flex h-10 min-w-11 shrink-0 snap-center items-center justify-center overflow-hidden rounded-xl border px-2.5 text-sm font-medium select-none',
                'transition-colors duration-150 ease-out',
                active
                  ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900',
              )}
            >
              <span
                aria-hidden="true"
                style={{ height: `${ratio * 100}%` }}
                className={cn(
                  'absolute inset-x-0 bottom-0 transition-[height] duration-150 ease-out',
                  active ? 'bg-emerald-400/30' : 'bg-emerald-500/20',
                )}
              />
              <span className="relative">W{week}</span>
              {isToday && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-1 right-1 size-1.5 rounded-full',
                    active ? 'bg-white' : 'bg-zinc-900',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
