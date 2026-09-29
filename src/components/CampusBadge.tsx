import type { Campus } from '../types'
import { CAMPUS_META } from '../lib/buildings'
import { cn } from '../lib/cn'

interface CampusBadgeProps {
  campus: Campus
  compact?: boolean
  className?: string
}

/** Monochrome campus marker: filled dot for Zentrum, ring for Hönggerberg. */
export function CampusBadge({ campus, compact, className }: CampusBadgeProps) {
  const meta = CAMPUS_META[campus]
  return (
    <span
      title={meta.name}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          campus === 'zentrum' ? 'bg-zinc-900' : 'border-[1.5px] border-zinc-900 bg-white',
        )}
      />
      {compact ? meta.short : meta.name}
    </span>
  )
}
