import { useMemo, useState } from 'react'
import { usePlanner } from '../../hooks/usePlannerStore'
import { useNow } from '../../hooks/useNow'
import { completedTodayCount, dailyTodoTarget } from '../../lib/progress'
import { formatDuration, studiedTodayMs, studyStats } from '../../lib/study'
import { cn } from '../../lib/cn'

interface HeaderStatsProps {
  open: number
  openThisWeek: number
  totalOpen: number
  dueThroughWeek: number
}

export function HeaderStats({ open, openThisWeek, totalOpen, dueThroughWeek }: HeaderStatsProps) {
  const { subjects, data } = usePlanner()
  const [view, setView] = useState(0)
  const now = useNow(true, data.activeStudy?.resumedAt != null ? 1000 : 60_000)
  const todayDone = completedTodayCount(subjects, now)
  const todayStudyMs = studiedTodayMs(data.studySessions, data.activeStudy, now)
  const stats = useMemo(() => studyStats(data.studySessions), [data.studySessions])
  const pace = dailyTodoTarget(open, todayDone, now).toLocaleString('en-GB', { maximumFractionDigits: 1 })
  const average = stats.tasks.length ? formatDuration(stats.avgPerTaskMs) : '—'
  const carriedOver = open - openThisWeek
  const views = [
    {
      primary: open > 0 ? `${open} to do` : 'All done',
      secondary: `${todayDone} done · ${formatDuration(todayStudyMs)}`,
      label: `${open} items still to do by the end of week ${dueThroughWeek}. ${todayDone} finished today. ${formatDuration(todayStudyMs)} studied today`,
      detail: `${openThisWeek} open this week · ${carriedOver} from earlier weeks · ${todayDone} done today · ${formatDuration(todayStudyMs)} studied today`,
      done: open === 0,
    },
    {
      primary: `${pace} / day`,
      secondary: `${average} avg / to-do`,
      label: `${pace} to-dos per day through Sunday. ${stats.tasks.length ? `${average} average recorded time per to-do` : 'No recorded to-do times yet'}`,
      detail: `(${open} remaining + ${todayDone} done today) ÷ ${7 - ((new Date(now).getDay() + 6) % 7)} days left, including today. Average combines all sessions for each subject, week and to-do, splitting shared time across to-dos.`,
      done: false,
    },
    {
      primary: `${totalOpen} to do`,
      secondary: 'until finished',
      label: `${totalOpen} to-dos remaining across the entire semester, including catch-up week`,
      detail: 'All remaining semester to-dos, including future weeks and catch-up week. Completed and canceled items are excluded.',
      done: totalOpen === 0,
    },
  ]
  const current = views[view]

  return (
    <button
      type="button"
      onClick={() => setView((previous) => (previous + 1) % views.length)}
      className={cn(
        'tabular grid min-h-11 min-w-11 shrink-0 cursor-pointer items-center rounded-2xl px-2.5 py-1 text-center text-xs leading-tight font-semibold',
        'transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2',
        current.done
          ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15'
          : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
      )}
      aria-label={`${current.label}. View ${view + 1} of ${views.length}. Activate to show ${['daily pace and average to-do time', 'total remaining to-dos', 'weekly and today’s progress'][view]}.`}
      title={`${current.detail} Click to cycle stats (${view + 1}/${views.length}).`}
    >
      {/* Overlapping views reserve the same footprint without shifting the header on each tap. */}
      {views.map((slide, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn('col-start-1 row-start-1 flex flex-col items-center whitespace-nowrap', index !== view && 'invisible')}
        >
          <span>{slide.primary}</span>
          <span className="text-[10px] font-medium opacity-70">{slide.secondary}</span>
        </span>
      ))}
    </button>
  )
}
