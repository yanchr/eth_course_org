import { useState, type FormEvent, type ReactNode } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import {
  DAYS,
  DEFAULT_CATEGORIES,
  SLOT_TYPES,
  type ScheduleSlot,
  type Subject,
  type SubjectLink,
} from '../types'
import { createId } from '../lib/id'
import { createSubject } from '../lib/subjects'
import { parseRoom } from '../lib/campus'
import { DAY_LABEL, SLOT_LABEL } from '../lib/schedule'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Field, inputClass } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { Pill } from './ui/Pill'
import { CampusBadge } from './CampusBadge'

interface SubjectEditorProps {
  /** null = closed, 'new' = create */
  subject: Subject | 'new' | null
  onClose: () => void
  onSave: (subject: Subject) => void
  onDelete: (id: string) => void
}

export function SubjectEditor({ subject, onClose, onSave, onDelete }: SubjectEditorProps) {
  const isNew = subject === 'new'
  return (
    <Sheet
      open={subject !== null}
      onClose={onClose}
      width="lg"
      title={isNew ? 'New subject' : 'Edit subject'}
    >
      {subject !== null && (
        <EditorForm
          key={isNew ? 'new' : subject.id}
          initial={isNew ? createSubject() : subject}
          isNew={isNew}
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
  onCancel: () => void
  onSave: (subject: Subject) => void
  onDelete: (id: string) => void
}

function EditorForm({ initial, isNew, onCancel, onSave, onDelete }: EditorFormProps) {
  const [draft, setDraft] = useState<Subject>(initial)
  const [newCategory, setNewCategory] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [nameError, setNameError] = useState(false)

  const patch = (p: Partial<Subject>) => setDraft((d) => ({ ...d, ...p }))
  const patchSlot = (id: string, p: Partial<ScheduleSlot>) =>
    patch({ scheduleSlots: draft.scheduleSlots.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const patchLink = (id: string, p: Partial<SubjectLink>) =>
    patch({ links: draft.links.map((l) => (l.id === id ? { ...l, ...p } : l)) })

  const addCategory = () => {
    const name = newCategory.trim()
    if (!name || draft.categories.some((c) => c.toLowerCase() === name.toLowerCase())) return
    patch({ categories: [...draft.categories, name] })
    setNewCategory('')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const name = draft.name.trim()
    if (!name) {
      setNameError(true)
      return
    }
    onSave({
      ...draft,
      name,
      lecturer: draft.lecturer.trim(),
      categories: draft.categories.length ? draft.categories : [...DEFAULT_CATEGORIES],
      links: draft.links
        .map((l) => ({ ...l, url: normalizeUrl(l.url), label: l.label.trim() }))
        .filter((l) => l.url)
        .map((l) => ({ ...l, label: l.label || l.url })),
      scheduleSlots: draft.scheduleSlots.map((s) => ({ ...s, time: s.time.trim(), room: s.room.trim() })),
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          value={draft.name}
          onChange={(e) => {
            patch({ name: e.target.value })
            setNameError(false)
          }}
          placeholder="e.g. Informatik"
          data-autofocus
          aria-invalid={nameError}
          hint={nameError ? <span className="text-red-600">A name is required.</span> : undefined}
        />
        <Field
          label="Lecturer"
          value={draft.lecturer}
          onChange={(e) => patch({ lecturer: e.target.value })}
          placeholder="e.g. Prof. Dr. Muster"
        />
      </div>

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

      <Section title="Schedule" description="Rooms like HG E 1.1 or HPH G 3 are placed on the campus map.">
        <ul className="flex flex-col gap-3">
          {draft.scheduleSlots.map((slot) => {
            const loc = parseRoom(slot.room)
            return (
              <li key={slot.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Slot type">
                    {SLOT_TYPES.map((t) => (
                      <Pill
                        key={t}
                        active={slot.type === t}
                        onClick={() => patchSlot(slot.id, { type: t })}
                        className="max-sm:h-11"
                      >
                        {SLOT_LABEL[t]}
                      </Pill>
                    ))}
                  </div>
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
                    placeholder="10:15-12:00"
                    inputMode="numeric"
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

      <Section title="Links" description="Course page, Moodle, exercise repo…">
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
        <Button
          icon={<Plus className="size-4" />}
          onClick={() => patch({ links: [...draft.links, { id: createId(), label: '', url: '' }] })}
        >
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
            {isNew ? 'Create subject' : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
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
