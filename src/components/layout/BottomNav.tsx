import { BookOpen, CalendarDays, ListChecks, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

export type MobileTab = 'week' | 'schedule' | 'subjects'

const TABS: { id: MobileTab; label: string; icon: LucideIcon }[] = [
  { id: 'week', label: 'Week', icon: ListChecks },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'subjects', label: 'Subjects', icon: BookOpen },
]

interface BottomNavProps {
  tab: MobileTab
  onChange: (tab: MobileTab) => void
}

export function BottomNav({ tab, onChange }: BottomNavProps) {
  return (
    <nav
      aria-label="Primary"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/90 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-lg">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = id === tab
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                'transition-colors duration-150 ease-out',
                active ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-700',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150 ease-out',
                  active && 'bg-zinc-900 text-white',
                )}
              >
                <Icon className="size-[18px]" strokeWidth={2} />
              </span>
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
