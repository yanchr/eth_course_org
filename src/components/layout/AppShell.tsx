import { useMemo, useState } from 'react'
import { Plus, Settings as SettingsIcon } from 'lucide-react'
import type { Day, Subject } from '../../types'
import { usePlanner } from '../../hooks/usePlannerStore'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { currentWeek, formatWeekRange, parseISODate, rawWeekIndex, todayDay } from '../../lib/semester'
import { sortByWeekOutstanding, weekCompletions } from '../../lib/progress'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { WeekPicker } from '../WeekPicker'
import { ProgressGrid } from '../ProgressGrid'
import { WeeklyTimetable } from '../WeeklyTimetable'
import { SubjectCard } from '../SubjectCard'
import { DayAgenda } from '../DayAgenda'
import { SubjectList } from '../SubjectList'
import { EmptyState } from '../EmptyState'
import { QuickAddSubjects } from '../QuickAddSubjects'
import { SubjectDetailDrawer } from '../SubjectDetailDrawer'
import { SubjectEditor } from '../SubjectEditor'
import { SettingsDrawer } from '../SettingsDrawer'
import { BottomNav, type MobileTab } from './BottomNav'

function semesterLabel(startDate: string): string {
  const d = parseISODate(startDate)
  const yy = String(d.getFullYear()).slice(2)
  return d.getMonth() >= 7 ? `HS${yy}` : `FS${yy}`
}

export function AppShell() {
  const { subjects, settings, upsertSubject, deleteSubject } = usePlanner()
  const isDesktop = useIsDesktop()
  const { semesterStartDate, weekCount } = settings

  const todayWeek = currentWeek(semesterStartDate, weekCount)
  const rawWeek = rawWeekIndex(semesterStartDate, weekCount)
  const inSemester = rawWeek >= 1 && rawWeek <= weekCount

  const [selectedWeek, setSelectedWeek] = useState(todayWeek)
  const [tab, setTab] = useState<MobileTab>('week')
  const [day, setDay] = useState<Day>(todayDay())
  const [detail, setDetail] = useState<{ id: string; slotId?: string } | null>(null)
  const [editing, setEditing] = useState<Subject | 'new' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const week = Math.min(selectedWeek, weekCount)
  const completion = useMemo(() => weekCompletions(subjects, weekCount), [subjects, weekCount])
  const weekOrder = useMemo(() => sortByWeekOutstanding(subjects, week), [subjects, week])
  const detailSubject = detail ? (subjects.find((s) => s.id === detail.id) ?? null) : null
  const openSubject = (subject: Subject, slotId?: string) => setDetail({ id: subject.id, slotId })
  const hasSubjects = subjects.length > 0

  const status = inSemester
    ? `Week ${todayWeek} of ${weekCount}`
    : rawWeek < 1
      ? 'Semester not started'
      : 'Semester ended'

  const header = (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-zinc-50/85 backdrop-blur-md">
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
        {isDesktop && hasSubjects && (
          <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Add subject
          </Button>
        )}
        <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon className="size-5" />
        </IconButton>
      </div>
      {hasSubjects && (isDesktop || tab !== 'subjects') && (
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
    content = <EmptyState onAdd={() => setEditing('new')} />
  } else if (isDesktop) {
    content = (
      <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-6 px-8 py-6">
        <section aria-labelledby="timetable-heading" className="flex min-w-0 flex-col gap-3">
          <PanelHeading id="timetable-heading" title="Timetable" meta={`Week ${week}`} />
          <WeeklyTimetable week={week} isCurrentWeek={inSemester && week === todayWeek} onOpen={openSubject} />
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
      <div className="mx-auto flex max-w-lg flex-col gap-3 px-4 pt-4 pb-28">
        {tab === 'week' && (
          <>
            <p className="px-1 text-xs text-zinc-500">Tap to mark done · long-press for no class</p>
            {weekOrder.map((s) => (
              <SubjectCard key={s.id} subject={s} week={week} onOpen={openSubject} />
            ))}
            <QuickAddSubjects collapsible onOpenDetailed={() => setEditing('new')} />
          </>
        )}
        {tab === 'schedule' && <DayAgenda week={week} day={day} onDayChange={setDay} onOpen={openSubject} />}
        {tab === 'subjects' && (
          <SubjectList
            todayWeek={inSemester ? todayWeek : Math.max(0, Math.min(rawWeek, weekCount))}
            onOpen={(s) => openSubject(s)}
            onAdd={() => setEditing('new')}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      {header}
      <main>{content}</main>
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
