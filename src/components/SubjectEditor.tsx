import { useState, type FormEvent, type ReactNode } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import {
  DAYS,
  DEFAULT_CATEGORIES,
  type ScheduleSlot,
  type Subject,
  type SubjectEvent,
  type SubjectLink,
} from '../types'
import { createId } from '../lib/id'
import { progressKey } from '../lib/progress'
import { createCalendarItem, createEvent, createSubject, isCalendar, isOnce, withEvent } from '../lib/subjects'
import { parseRoom } from '../lib/campus'
import { DAY_LABEL, normalizeSlotType, slotLabel } from '../lib/schedule'
import { normalizeTimeRange } from '../lib/semester'
import { usePlanner } from '../hooks/usePlannerStore'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Field, inputClass } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { Pill } from './ui/Pill'
import { CampusBadge } from './CampusBadge'
import { cn } from '../lib/cn'

export type EditorTarget = Subject | 'new' | 'event' | 'calendar'

interface SubjectEditorProps {
  /** null = closed, 'new' = weekly subject, 'event' = one-off to-do, 'calendar' = schedule only */
  subject: EditorTarget | null
  defaultWeek: number
  onClose: () => void
  onSave: (subject: Subject) => void
  onDelete: (id: string) => void
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function editorTitle(subject: EditorTarget | null): string {
  if (subject === null) return ''
  if (subject === 'new') return 'New subject'
  if (subject === 'event') return 'New event'
  if (subject === 'calendar') return 'New calendar item'
  if (subject.calendarOnly) return 'Edit calendar item'
  return subject.onceWeek != null ? 'Edit event' : 'Edit subject'
}

function initialDraft(subject: EditorTarget, defaultWeek: number): Subject {
  if (subject === 'new') return createSubject()
  if (subject === 'event') return createEvent(defaultWeek)
  if (subject === 'calendar') return createCalendarItem(defaultWeek)
  return subject
}

export function SubjectEditor({ subject, defaultWeek, onClose, onSave, onDelete }: SubjectEditorProps) {
  const isCreate = subject === 'new' || subject === 'event' || subject === 'calendar'
  return (
    <Sheet open={subject !== null} onClose={onClose} width="lg" title={editorTitle(subject)}>
      {subject !== null && (
        <EditorForm
          key={isCreate ? String(subject) : subject.id}
          initial={initialDraft(subject, defaultWeek)}
          isNew={isCreate}
          defaultWeek={defaultWeek}
          onCancel={onClose}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </Sheet>
  )
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
}

interface EditorFormProps {
  initial: Subject
  isNew: boolean
  defaultWeek: number
  onCancel: () => void
  onSave: (subject: Subject) => void
  onDelete: (id: string) => void
}

function EditorForm({ initial, isNew, defaultWeek, onCancel, onSave, onDelete }: EditorFormProps) {
  const { settings, subjects } = usePlanner()
  const [draft, setDraft] = useState<Subject>(initial)
  const [newCategory, setNewCategory] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [parentId, setParentId] = useState('')
  const attachTargets = subjects.filter((s) => !isOnce(s) && !isCalendar(s))

  const once = draft.onceWeek != null
  const calendar = draft.calendarOnly === true

  const patch = (p: Partial<Subject>) => setDraft((d) => ({ ...d, ...p }))
  const patchSlot = (id: string, p: Partial<ScheduleSlot>) =>
    patch({ scheduleSlots: draft.scheduleSlots.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const patchLink = (id: string, p: Partial<SubjectLink>) =>
    patch({ links: draft.links.map((l) => (l.id === id ? { ...l, ...p } : l)) })

  const setKind = (kind: 'weekly' | 'once') => {
    if (kind === 'weekly') setParentId('')
    if (kind === 'once') {
      patch({
        onceWeek: draft.onceWeek ?? defaultWeek,
        categories: calendar
          ? draft.categories
          : sameList(draft.categories, DEFAULT_CATEGORIES)
            ? ['Event']
            : draft.categories,
      })
      return
    }
    patch({
      onceWeek: undefined,
      categories: calendar
        ? draft.categories
        : sameList(draft.categories, ['Event'])
          ? [...DEFAULT_CATEGORIES]
          : draft.categories,
    })
  }

  const setTrack = (track: 'todo' | 'calendar') => {
    if (track === 'calendar') {
      setParentId('')
      patch({ calendarOnly: true, categories: [] })
      return
    }
    patch({
      calendarOnly: undefined,
      categories: once ? ['Event'] : [...DEFAULT_CATEGORIES],
    })
  }

  const addCategory = () => {
    const name = newCategory.trim()
    if (!name || draft.categories.some((c) => c.toLowerCase() === name.toLowerCase())) return
    patch({ categories: [...draft.categories, name] })
    setNewCategory('')
  }

  const removeEvent = (event: SubjectEvent) => {
    const progress = { ...draft.progress }
    delete progress[progressKey(event.week, event.name)]
    const events = (draft.events ?? []).filter((item) => item.id !== event.id)
    patch({ events: events.length > 0 ? events : undefined, progress })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const name = draft.name.trim()
    if (!name) {
      setNameError('A name is required.')
      return
    }
    const parent = parentId ? attachTargets.find((s) => s.id === parentId) : undefined
    if (parent && once && !calendar) {
      const taken =
        parent.categories.some((c) => c.toLowerCase() === name.toLowerCase()) ||
        (parent.events ?? []).some((event) => event.week === draft.onceWeek && event.name.toLowerCase() === name.toLowerCase())
      if (taken) {
        setNameError(`${parent.name} already has a to-do named ${name} in this week.`)
        return
      }
      const slots = draft.scheduleSlots
        .map((s) => ({ ...s, time: s.time.trim(), room: s.room.trim() }))
        .filter((s) => s.time || s.room)
      const links = draft.links
        .map((l) => ({ ...l, url: normalizeUrl(l.url), label: l.label.trim() }))
        .filter((l) => l.url)
        .map((l) => ({ ...l, label: l.label || l.url }))
      onSave(
        withEvent(parent, {
          id: createId(),
          name,
          week: draft.onceWeek ?? defaultWeek,
          slots,
          links,
        }),
      )
      return
    }
    onSave({
      ...draft,
      name,
      lecturer: draft.lecturer.trim(),
      onceWeek: once ? draft.onceWeek : undefined,
      calendarOnly: calendar ? true : undefined,
      categories: calendar
        ? []
        : draft.categories.length
          ? draft.categories
          : once
            ? ['Event']
            : [...DEFAULT_CATEGORIES],
      links: draft.links
        .map((l) => ({ ...l, url: normalizeUrl(l.url), label: l.label.trim() }))
        .filter((l) => l.url)
        .map((l) => ({ ...l, label: l.label || l.url })),
      scheduleSlots: draft.scheduleSlots.map((s) => ({ ...s, time: s.time.trim(), room: s.room.trim() })),
      events: draft.events?.length ? draft.events : undefined,
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-7">
      <div className="flex flex-col gap-4">
        <div className={cn('grid gap-4', parentId ? '' : 'sm:grid-cols-2')}>
          <Field
            label="Name"
            value={draft.name}
            onChange={(e) => {
              patch({ name: e.target.value })
              setNameError(null)
            }}
            placeholder={calendar ? 'e.g. Gym' : once ? 'e.g. Midterm' : 'e.g. Informatik'}
            data-autofocus
            aria-invalid={nameError !== null}
            hint={nameError ? <span className="text-red-600">{nameError}</span> : undefined}
          />
          {!parentId && (
            <Field
              label={calendar ? 'Note' : once ? 'Host' : 'Lecturer'}
              value={draft.lecturer}
              onChange={(e) => patch({ lecturer: e.target.value })}
              placeholder={calendar || once ? 'Optional' : 'e.g. Prof. Dr. Muster'}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <ModeToggle
            label="Repeats"
            off="Every week"
            on="Once"
            checked={once}
            onChange={(next) => setKind(next ? 'once' : 'weekly')}
          />
          <ModeToggle
            label="Counts as"
            off="To-do"
            on="Calendar only"
            checked={calendar}
            onChange={(next) => setTrack(next ? 'calendar' : 'todo')}
          />
        </div>
      </div>

      {once && (
        <Section title="Week" description={parentId ? 'The to-do is only added in this week.' : 'This only appears in the week you pick.'}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Week">
            {Array.from({ length: settings.weekCount }, (_, i) => {
              const w = i + 1
              return (
                <Pill
                  key={w}
                  active={draft.onceWeek === w}
                  onClick={() => patch({ onceWeek: w })}
                  className="min-w-11 max-sm:h-11"
                >
                  W{w}
                </Pill>
              )
            })}
          </div>
        </Section>
      )}

      {once && !calendar && isNew && attachTargets.length > 0 && (
        <Section
          title="Subject"
          description="Optional. The name becomes one to-do on that subject, only in the week you pick."
        >
          <select
            className={inputClass}
            value={parentId}
            aria-label="Add to subject"
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">No subject — keep it separate</option>
            {attachTargets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Section>
      )}

      {!once && !calendar && (draft.events ?? []).some((event) => event.name) && (
        <Section title="Single to-dos" description="Added from an event. Each one only counts in its week.">
          <ul className="flex flex-col gap-2">
            {(draft.events ?? [])
              .filter((event) => event.name)
              .map((event) => (
                <li
                  key={event.id}
                  className="flex min-h-11 items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">
                    {event.name}
                    <span className="font-normal text-zinc-400"> · week {event.week}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${event.name}`}
                    onClick={() => removeEvent(event)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors duration-150 ease-out hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
          </ul>
        </Section>
      )}

      {!once && !calendar && (
        <Section title="Progress categories" description="Rows tracked every week.">
          <div className="flex flex-wrap gap-2">
            {draft.categories.map((c) => (
              <span
                key={c}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-zinc-200 bg-white pr-1 pl-3.5 text-sm font-medium text-zinc-800"
              >
                {c}
                <button
                  type="button"
                  aria-label={`Remove ${c}`}
                  onClick={() => patch({ categories: draft.categories.filter((x) => x !== c) })}
                  className="flex size-7 items-center justify-center rounded-full text-zinc-400 transition-colors duration-150 ease-out hover:bg-zinc-100 hover:text-zinc-900"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={newCategory}
              placeholder="Add category"
              aria-label="New category name"
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCategory()
                }
              }}
            />
            <Button onClick={addCategory} icon={<Plus className="size-4" />} disabled={!newCategory.trim()}>
              Add
            </Button>
          </div>
        </Section>
      )}

      <Section
        title="Schedule"
        description={
          calendar
            ? "Shown on the timetable only, not in this week's to-dos."
            : once
              ? 'Day, time and room for this single occurrence.'
              : 'Rooms like HG E 1.1 or HPH G 3 are placed on the campus map.'
        }
      >
        <ul className="flex flex-col gap-3">
          {draft.scheduleSlots.map((slot) => {
            const loc = parseRoom(slot.room)
            return (
              <li key={slot.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-3">
                <div className="flex items-end gap-2">
                  {!once && !calendar ? (
                    <Field
                      label="Type"
                      value={slotLabel(slot.type)}
                      onChange={(e) => patchSlot(slot.id, { type: e.target.value })}
                      onBlur={(e) => patchSlot(slot.id, { type: normalizeSlotType(e.target.value) })}
                      placeholder="Lecture"
                      className="min-w-0 flex-1"
                    />
                  ) : (
                    <span className="flex h-11 flex-1 items-center text-sm font-medium text-zinc-500">When</span>
                  )}
                  <IconButton
                    label="Remove slot"
                    onClick={() => patch({ scheduleSlots: draft.scheduleSlots.filter((s) => s.id !== slot.id) })}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Day">
                  {DAYS.map((d) => (
                    <Pill
                      key={d}
                      active={slot.day === d}
                      onClick={() => patchSlot(slot.id, { day: d })}
                      aria-label={DAY_LABEL[d]}
                      className="min-w-12 max-sm:h-11"
                    >
                      {d}
                    </Pill>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Time"
                    value={slot.time}
                    onChange={(e) => patchSlot(slot.id, { time: e.target.value })}
                    onBlur={(e) => patchSlot(slot.id, { time: normalizeTimeRange(e.target.value) })}
                    placeholder="10:15-12:00"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <Field
                    label="Room"
                    value={slot.room}
                    onChange={(e) => patchSlot(slot.id, { room: e.target.value })}
                    placeholder="HG E 1.1"
                    autoCapitalize="characters"
                    hint={
                      loc ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <CampusBadge campus={loc.campus} compact />
                          {!loc.coords && <span className="text-zinc-400">not on map</span>}
                        </span>
                      ) : undefined
                    }
                  />
                </div>
              </li>
            )
          })}
        </ul>
        <Button
          icon={<Plus className="size-4" />}
          onClick={() =>
            patch({
              scheduleSlots: [
                ...draft.scheduleSlots,
                { id: createId(), type: 'lecture', day: 'Mon', time: '', room: '' },
              ],
            })
          }
        >
          Add slot
        </Button>
      </Section>

      <Section
        title="Links"
        description={calendar ? 'Optional' : once ? 'Slides, Zoom, signup sheet…' : 'Course page, Moodle, exercise repo…'}
      >
        <ul className="flex flex-col gap-2">
          {draft.links.map((link) => (
            <li key={link.id} className="flex items-center gap-2">
              <input
                className={`${inputClass} w-1/3`}
                value={link.label}
                placeholder="Label"
                aria-label="Link label"
                onChange={(e) => patchLink(link.id, { label: e.target.value })}
              />
              <input
                className={inputClass}
                value={link.url}
                placeholder="https://…"
                aria-label="Link URL"
                inputMode="url"
                onChange={(e) => patchLink(link.id, { url: e.target.value })}
              />
              <IconButton label="Remove link" onClick={() => patch({ links: draft.links.filter((l) => l.id !== link.id) })}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
        <Button icon={<Plus className="size-4" />} onClick={() => patch({ links: [...draft.links, { id: createId(), label: '', url: '' }] })}>
          Add link
        </Button>
      </Section>

      <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center">
        {!isNew &&
          (confirmDelete ? (
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => onDelete(draft.id)} icon={<Trash2 className="size-4" />}>
                Confirm delete
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="size-4" />}>
              Delete
            </Button>
          ))}
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="secondary" onClick={onCancel} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1 sm:flex-none">
            {isNew
              ? calendar
                ? 'Add to calendar'
                : once
                  ? parentId
                    ? 'Add to subject'
                    : 'Create event'
                  : 'Create subject'
              : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
  )
}

function ModeToggle({
  label,
  off,
  on,
  checked,
  onChange,
}: {
  label: string
  off: string
  on: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}, ${checked ? on : off}`}
      onClick={() => onChange(!checked)}
      className="flex h-11 items-center gap-2.5 rounded-lg pr-1 text-sm select-none"
    >
      <span
        className={cn(
          'transition-colors duration-150 ease-out',
          checked ? 'text-zinc-400' : 'font-medium text-zinc-800',
        )}
      >
        {off}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-out',
          checked ? 'bg-zinc-900' : 'bg-zinc-200',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out',
            checked && 'translate-x-4',
          )}
        />
      </span>
      <span
        className={cn(
          'transition-colors duration-150 ease-out',
          checked ? 'font-medium text-zinc-800' : 'text-zinc-400',
        )}
      >
        {on}
      </span>
    </button>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {description && <p className="text-xs text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  )
}
