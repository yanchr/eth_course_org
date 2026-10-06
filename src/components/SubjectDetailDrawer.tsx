import { useState } from 'react'
import { CalendarDays, Clock, ExternalLink, Link2, MapPin, Pencil, User } from 'lucide-react'
import type { Subject } from '../types'
import { parseRoom } from '../lib/campus'
import { DAY_LABEL, slotLabel, sortSlots } from '../lib/schedule'
import { eventForSlot, isCalendar, isOnce } from '../lib/subjects'
import { cn } from '../lib/cn'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { CampusBadge } from './CampusBadge'
import { CampusMapOverlay } from './CampusMapOverlay'

interface SubjectDetailDrawerProps {
  subject: Subject | null
  initialSlotId?: string
  onClose: () => void
  onEdit: (subject: Subject) => void
}

export function SubjectDetailDrawer({ subject, initialSlotId, onClose, onEdit }: SubjectDetailDrawerProps) {
  return (
    <Sheet
      open={subject !== null}
      onClose={onClose}
      width="lg"
      title={subject?.name ?? ''}
      subtitle={
        subject
          ? isCalendar(subject)
            ? isOnce(subject)
              ? `Calendar · week ${subject.onceWeek}`
              : 'Calendar · every week'
            : isOnce(subject)
              ? `Once · week ${subject.onceWeek}`
              : subject.lecturer || undefined
          : undefined
      }
      footer={
        subject && (
          <div className="flex justify-end">
            <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => onEdit(subject)}>
              {isCalendar(subject) ? 'Edit calendar item' : isOnce(subject) ? 'Edit event' : 'Edit subject'}
            </Button>
          </div>
        )
      }
    >
      {subject && <DetailBody key={subject.id} subject={subject} initialSlotId={initialSlotId} />}
    </Sheet>
  )
}

function DetailBody({ subject, initialSlotId }: { subject: Subject; initialSlotId?: string }) {
  const slots = sortSlots([
    ...subject.scheduleSlots,
    ...(subject.events ?? []).flatMap((event) => event.slots),
  ])
  const links = [
    ...subject.links.map((link) => ({ ...link, note: '' })),
    ...(subject.events ?? []).flatMap((event) => event.links.map((link) => ({ ...link, note: event.name }))),
  ]
  const withRoom = slots.filter((s) => s.room.trim())
  const [selectedId, setSelectedId] = useState<string | undefined>(
    withRoom.find((s) => s.id === initialSlotId)?.id ?? withRoom[0]?.id,
  )
  const selected = withRoom.find((s) => s.id === selectedId)

  return (
    <div className="flex flex-col gap-6">
      {subject.onceWeek != null && (
        <section className="flex items-center gap-3 text-sm">
          <span className="flex size-9 items-center justify-center rounded-xl bg-zinc-100">
            <CalendarDays className="size-4 text-zinc-600" />
          </span>
          <div>
            <div className="text-xs text-zinc-400">When</div>
            <div className="font-medium text-zinc-900">
              {isCalendar(subject) ? `Week ${subject.onceWeek} · calendar only` : `Week ${subject.onceWeek} only`}
            </div>
          </div>
        </section>
      )}
      {isCalendar(subject) && subject.onceWeek == null && (
        <section className="flex items-center gap-3 text-sm">
          <span className="flex size-9 items-center justify-center rounded-xl bg-calendar">
            <CalendarDays className="size-4 text-calendar-ink" />
          </span>
          <div>
            <div className="text-xs text-zinc-400">When</div>
            <div className="font-medium text-zinc-900">Every week · calendar only</div>
          </div>
        </section>
      )}

      {subject.lecturer && (
        <section className="flex items-center gap-3 text-sm">
          <span className="flex size-9 items-center justify-center rounded-xl bg-zinc-100">
            <User className="size-4 text-zinc-600" />
          </span>
          <div>
            <div className="text-xs text-zinc-400">{isCalendar(subject) ? 'Note' : 'Lecturer'}</div>
            <div className="font-medium text-zinc-900">{subject.lecturer}</div>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Schedule</h3>
        {slots.length === 0 ? (
          <p className="text-sm text-zinc-500">No schedule slots yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5" role="list">
            {slots.map((slot) => {
              const loc = parseRoom(slot.room)
              const active = slot.id === selectedId
              const attached = eventForSlot(subject, slot.id)
              return (
                <li key={slot.id}>
                  <button
                    type="button"
                    disabled={!loc}
                    aria-pressed={active}
                    onClick={() => setSelectedId(slot.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left',
                      'transition-colors duration-150 ease-out disabled:cursor-default',
                      active ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-white hover:border-zinc-300',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-900">
                        {attached
                          ? attached.name
                          : isCalendar(subject) || isOnce(subject)
                            ? DAY_LABEL[slot.day]
                            : slotLabel(slot.type)}
                        {attached ? (
                          <span className="ml-2 font-normal text-zinc-500">
                            {DAY_LABEL[slot.day]} · week {attached.week}
                          </span>
                        ) : (
                          !isCalendar(subject) &&
                          !isOnce(subject) && <span className="ml-2 font-normal text-zinc-500">{DAY_LABEL[slot.day]}</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                        <span className="tabular flex items-center gap-1">
                          <Clock className="size-3" />
                          {slot.time || 'No time'}
                        </span>
                        {slot.room && (
                          <span className="flex items-center gap-1 font-medium text-zinc-700">
                            <MapPin className="size-3" />
                            {slot.room}
                          </span>
                        )}
                      </div>
                    </div>
                    {loc && <CampusBadge campus={loc.campus} compact />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {(subject.events ?? []).some((event) => event.name) && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Single to-dos</h3>
          <ul className="flex flex-col gap-1.5">
            {(subject.events ?? [])
              .filter((event) => event.name)
              .map((event) => (
                <li
                  key={event.id}
                  className="flex items-baseline justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-zinc-900">{event.name}</span>
                  <span className="tabular text-xs text-zinc-500">Week {event.week}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Links</h3>
        {links.length === 0 ? (
          <p className="text-sm text-zinc-500">No links yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {links.map((link) => (
              <li key={link.id}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm transition-colors duration-150 ease-out hover:border-zinc-300"
                >
                  <Link2 className="size-4 shrink-0 text-zinc-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-zinc-900">{link.label}</span>
                    <span className="block truncate text-xs text-zinc-400">
                      {link.note ? `${link.note} · ` : ''}
                      {link.url}
                    </span>
                  </span>
                  <ExternalLink className="size-3.5 shrink-0 text-zinc-400" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Location</h3>
          <CampusMapOverlay key={selected.id} room={selected.room} />
        </section>
      )}
    </div>
  )
}
