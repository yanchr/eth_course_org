import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Plus, Settings as SettingsIcon, Timer } from 'lucide-react'
import type { Subject } from '../../types'
import { usePlanner } from '../../hooks/usePlannerStore'
import { useFitsWeekCalendar, useIsDesktop } from '../../hooks/useMediaQuery'
import { currentWeek, formatWeekRange, parseISODate, rawWeekIndex } from '../../lib/semester'
import { sortByWeekOutstanding, weekCompletions } from '../../lib/progress'
import { activeElapsedMs, formatClock, formatDuration, studyStats } from '../../lib/study'
import { useNow } from '../../hooks/useNow'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { WeekPicker } from '../WeekPicker'
import { ProgressGrid } from '../ProgressGrid'
import { WeeklyTimetable } from '../WeeklyTimetable'
import { SubjectCard } from '../SubjectCard'
import { SubjectList } from '../SubjectList'
import { EmptyState } from '../EmptyState'
import { QuickAddSubjects } from '../QuickAddSubjects'
import { SubjectDetailDrawer } from '../SubjectDetailDrawer'
import { SubjectEditor, type EditorTarget } from '../SubjectEditor'
import { SettingsDrawer } from '../SettingsDrawer'
import { StudyView } from '../StudyView'
import { BottomNav, type MobileTab } from './BottomNav'

function semesterLabel(startDate: string): string {
  const d = parseISODate(startDate)
  const yy = String(d.getFullYear()).slice(2)
  return d.getMonth() >= 7 ? `HS${yy}` : `FS${yy}`
}

export function AppShell() {
  const { subjects, settings, data, upsertSubject, deleteSubject } = usePlanner()
  const isDesktop = useIsDesktop()
  const weekCalendar = useFitsWeekCalendar()
  const { semesterStartDate, weekCount } = settings

  const todayWeek = currentWeek(semesterStartDate, weekCount)
  const rawWeek = rawWeekIndex(semesterStartDate, weekCount)
  const inSemester = rawWeek >= 1 && rawWeek <= weekCount

  const headerRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const apply = () => {
      document.documentElement.style.setProperty('--app-header-h', `${el.getBoundingClientRect().height}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const [selectedWeek, setSelectedWeek] = useState(todayWeek)
  const [tab, setTab] = useState<MobileTab>('week')
  const [detail, setDetail] = useState<{ id: string; slotId?: string } | null>(null)
  const [editing, setEditing] = useState<EditorTarget | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const week = Math.min(selectedWeek, weekCount)
  const completion = useMemo(() => weekCompletions(subjects, weekCount), [subjects, weekCount])
  const weekOrder = useMemo(() => sortByWeekOutstanding(subjects, week), [subjects, week])
  const detailSubject = detail ? (subjects.find((s) => s.id === detail.id) ?? null) : null
  const openSubject = (subject: Subject, slotId?: string) => setDetail({ id: subject.id, slotId })
  const hasSubjects = subjects.length > 0
  const studying = tab === 'study'
  const avgPerTask = useMemo(() => {
    const s = studyStats(data.studySessions)
    return s.tasks.length ? s.avgPerTaskMs : null
  }, [data.studySessions])

  const status = inSemester
    ? `Week ${todayWeek} of ${weekCount}`
    : rawWeek < 1
      ? 'Semester not started'
      : 'Semester ended'

  /** Everything due by the end of the current week, leftovers from earlier weeks included. */
  const dueThroughWeek = inSemester ? todayWeek : rawWeek < 1 ? 0 : weekCount
  const open = completion
    .slice(0, dueThroughWeek)
    .reduce((sum, w) => sum + w.scheduled - w.completed, 0)
  const openThisWeek = dueThroughWeek > 0 ? completion[dueThroughWeek - 1].scheduled - completion[dueThroughWeek - 1].completed : 0
  const carriedOver = open - openThisWeek

  const header = (
    <header ref={headerRef} className="z-30 shrink-0 border-b border-zinc-200/80 bg-zinc-50/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 lg:px-8 lg:py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold tracking-tight text-white">
          {semesterLabel(semesterStartDate).slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight text-zinc-900">
            Course Planner <span className="font-normal text-zinc-400">{semesterLabel(semesterStartDate)}</span>
          </h1>
          <p className="tabular truncate text-xs text-zinc-500">
            {status} · W{week}: {formatWeekRange(semesterStartDate, week)}
          </p>
        </div>
        {hasSubjects && dueThroughWeek > 0 && (
          <span
            className={cn(
              'tabular flex shrink-0 flex-col items-center rounded-full px-2.5 py-1 text-xs leading-tight font-semibold',
              'transition-colors duration-150 ease-out',
              avgPerTask !== null && 'rounded-2xl',
              open > 0 ? 'bg-zinc-100 text-zinc-700' : 'bg-emerald-500/10 text-emerald-700',
            )}
            aria-label={[
              open > 0
                ? `${open} item${open === 1 ? '' : 's'} still to do by the end of week ${dueThroughWeek}`
                : `Nothing left to do through week ${dueThroughWeek}`,
              avgPerTask !== null ? `${formatDuration(avgPerTask)} average study time per to-do` : '',
            ]
              .filter(Boolean)
              .join('. ')}
            title={
              carriedOver > 0
                ? `${openThisWeek} open this week · ${carriedOver} from earlier weeks`
                : `${openThisWeek} open this week`
            }
          >
            <span>{open > 0 ? `${open} to do` : 'All done'}</span>
            {avgPerTask !== null && (
              <span className="text-[10px] font-medium opacity-70">{formatDuration(avgPerTask)} avg</span>
            )}
          </span>
        )}
        {hasSubjects && data.activeStudy && !studying && (
          <StudyChip onOpen={() => setTab('study')} />
        )}
        {isDesktop && hasSubjects && (
          <>
            <Button
              variant={studying ? 'secondary' : 'ghost'}
              size="sm"
              icon={<Timer className="size-4" />}
              aria-pressed={studying}
              onClick={() => setTab(studying ? 'week' : 'study')}
            >
              Study
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing('calendar')}>
              Calendar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing('event')}>
              Add event
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Add subject
            </Button>
          </>
        )}
        <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon className="size-5" />
        </IconButton>
      </div>
      {hasSubjects && !studying && (isDesktop || tab !== 'subjects') && (
        <div className="mx-auto max-w-[1600px] px-4 pb-3 lg:px-8">
          <WeekPicker
            weekCount={weekCount}
            selected={week}
            todayWeek={inSemester ? todayWeek : -1}
            semesterStartDate={semesterStartDate}
            completion={completion}
            onSelect={setSelectedWeek}
          />
        </div>
      )}
    </header>
  )

  let content
  if (!hasSubjects) {
    content = (
      <EmptyState
        onAdd={() => setEditing('new')}
        onAddEvent={() => setEditing('event')}
        onAddCalendar={() => setEditing('calendar')}
      />
    )
  } else if (isDesktop && studying) {
    content = (
      <div className="mx-auto w-full max-w-3xl px-8 py-6">
        <StudyView defaultWeek={todayWeek} />
      </div>
    )
  } else if (isDesktop) {
    content = (
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-start gap-6 px-8 py-6 xl:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]">
        <section
          aria-labelledby="timetable-heading"
          className="flex h-[calc(100dvh-var(--app-header-h,8rem)-3rem)] min-h-0 min-w-0 flex-col gap-3 self-start xl:sticky xl:top-0"
        >
          <PanelHeading id="timetable-heading" title="Timetable" meta={`Week ${week}`} />
          <WeeklyTimetable week={week} onOpen={openSubject} onWeekChange={setSelectedWeek} />
        </section>
        <section aria-labelledby="progress-heading" className="flex min-w-0 flex-col gap-3">
          <PanelHeading
            id="progress-heading"
            title="Progress"
            meta="Click to mark done · right-click or long-press for no class"
          />
          <ProgressGrid
            selectedWeek={week}
            todayWeek={inSemester ? todayWeek : -1}
            onSelectWeek={setSelectedWeek}
            onOpenSubject={(s) => openSubject(s)}
          />
          <QuickAddSubjects collapsible onOpenDetailed={() => setEditing('new')} />
        </section>
      </div>
    )
  } else {
    content = (
      <div
        className={cn(
          'mx-auto flex w-full flex-col gap-3 px-4',
          tab === 'schedule' ? 'min-h-0 flex-1 pt-3' : 'pt-4',
          weekCalendar && tab === 'schedule' ? 'max-w-5xl' : 'max-w-lg',
        )}
      >
        {tab === 'week' && (
          <>
            <p className="px-1 text-xs text-zinc-500">Tap to mark done · long-press for no class</p>
            {weekOrder.length === 0 && (
              <p className="rounded-2xl border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">
                Nothing this week.
              </p>
            )}
            {weekOrder.map((s) => (
              <SubjectCard key={s.id} subject={s} week={week} onOpen={openSubject} />
            ))}
            <QuickAddSubjects collapsible onOpenDetailed={() => setEditing('new')} />
          </>
        )}
        {tab === 'schedule' && (
          <WeeklyTimetable
            week={week}
            onOpen={openSubject}
            onWeekChange={setSelectedWeek}
            daysVisible={weekCalendar ? 7 : 2}
          />
        )}
        {tab === 'subjects' && (
          <SubjectList
            todayWeek={inSemester ? todayWeek : Math.max(0, Math.min(rawWeek, weekCount))}
            onOpen={(s) => openSubject(s)}
            onAdd={() => setEditing('new')}
            onAddEvent={() => setEditing('event')}
            onAddCalendar={() => setEditing('calendar')}
          />
        )}
        {tab === 'study' && <StudyView defaultWeek={todayWeek} />}
      </div>
    )
  }

  const scheduleFills = !isDesktop && hasSubjects && tab === 'schedule'

  return (
    <div className="flex h-dvh flex-col">
      {header}
      <main
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          scheduleFills ? 'overflow-hidden' : 'overflow-y-auto',
          !isDesktop && hasSubjects && 'pb-[calc(4rem+env(safe-area-inset-bottom))]',
        )}
      >
        {content}
      </main>
      {!isDesktop && hasSubjects && <BottomNav tab={tab} onChange={setTab} />}

      <SubjectDetailDrawer
        subject={detailSubject}
        initialSlotId={detail?.slotId}
        onClose={() => setDetail(null)}
        onEdit={(s) => {
          setDetail(null)
          setEditing(s)
        }}
      />
      <SubjectEditor
        subject={editing}
        defaultWeek={week}
        onClose={() => setEditing(null)}
        onSave={(s) => {
          upsertSubject(s)
          setEditing(null)
        }}
        onDelete={(id) => {
          deleteSubject(id)
          setEditing(null)
        }}
      />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

function StudyChip({ onOpen }: { onOpen: () => void }) {
  const { data } = usePlanner()
  const active = data.activeStudy
  const running = active?.resumedAt != null
  const now = useNow(running)
  if (!active) return null
  const elapsed = formatClock(activeElapsedMs(active, now))
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${running ? 'Recording' : 'Paused'} ${elapsed}, open study timer`}
      className={cn(
        'tabular flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold lg:h-9',
        'transition-colors duration-150 ease-out',
        running ? 'bg-red-500/10 text-red-700 hover:bg-red-500/15' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
      )}
    >
      <span className={cn('size-2 rounded-full', running ? 'bg-red-500' : 'bg-zinc-400')} aria-hidden="true" />
      {elapsed}
    </button>
  )
}

function PanelHeading({ id, title, meta }: { id: string; title: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 id={id} className="text-sm font-semibold text-zinc-900">
        {title}
      </h2>
      {meta && <span className="truncate text-xs text-zinc-400">{meta}</span>}
    </div>
  )
}
