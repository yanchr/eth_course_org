import type { KeyboardEvent } from 'react'
import { Check, Minus } from 'lucide-react'
import type { ProgressState } from '../types'
import { useLongPress } from '../hooks/useLongPress'
import { stateLabel, toggleCanceled, toggleCompleted } from '../lib/progress'
import { cn } from '../lib/cn'

interface ProgressCellProps {
  state: ProgressState
  onChange: (next: ProgressState) => void
  /** accessible context, e.g. "Informatik, Lecture, week 3" */
  context: string
  variant?: 'grid' | 'card'
  /** visible label for the card variant */
  label?: string
  /** Compact average already logged for this todo, e.g. "42m". */
  averageLabel?: string
  highlighted?: boolean
  tabIndex?: number
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void
  dataAttrs?: Record<string, string | number>
}

export function ProgressCell({
  state,
  onChange,
  context,
  variant = 'grid',
  label,
  averageLabel,
  highlighted,
  tabIndex,
  onKeyDown,
  dataAttrs,
}: ProgressCellProps) {
  const press = useLongPress({
    onTap: () => onChange(toggleCompleted(state)),
    onLongPress: () => onChange(toggleCanceled(state)),
  })

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    press.onKeyDown(e)
    onKeyDown?.(e)
  }

  const base = cn(
    'relative select-none [touch-action:manipulation] [-webkit-touch-callout:none]',
    'transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-95',
  )

  const stateClass =
    state === 'completed'
      ? 'border-zinc-900 bg-zinc-900 text-white'
      : state === 'canceled'
        ? 'border-dashed border-zinc-300 bg-zinc-100 text-zinc-400'
        : cn(
            'border-zinc-200 bg-white text-zinc-300 hover:border-zinc-400 hover:text-zinc-400',
            highlighted && 'border-zinc-300',
          )

  const title = `${context}: ${stateLabel(state)}${averageLabel ? `, ${averageLabel} average` : ''}. Tap to toggle done, long-press or right-click for no class.`

  if (variant === 'card') {
    return (
      <button
        type="button"
        aria-pressed={state === 'completed'}
        aria-label={`${context}, ${stateLabel(state)}${averageLabel ? `, ${averageLabel} average` : ''}`}
        title={title}
        tabIndex={tabIndex}
        {...dataAttrs}
        {...press}
        onKeyDown={handleKeyDown}
        className={cn(
          base,
          stateClass,
          'flex min-h-14 flex-col items-start justify-between gap-1 rounded-2xl border px-3 py-2.5 text-left',
        )}
      >
        <span className="flex w-full items-center justify-between">
          <span
            className={cn(
              'text-sm font-medium',
              state === 'pending' && 'text-zinc-700',
              state === 'canceled' && 'line-through decoration-zinc-400',
            )}
          >
            {label}
          </span>
          <StateGlyph state={state} className="size-4" />
        </span>
        <span className="flex w-full items-baseline justify-between gap-1">
          <span className="truncate text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
            {state === 'completed' ? 'Done' : state === 'canceled' ? 'No class' : 'Open'}
          </span>
          {averageLabel && (
            <span className="tabular shrink-0 text-[10px] font-medium tracking-normal text-zinc-400 normal-case">
              {averageLabel}
            </span>
          )}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-pressed={state === 'completed'}
      aria-label={`${context}, ${stateLabel(state)}`}
      title={title}
      tabIndex={tabIndex}
      {...dataAttrs}
      {...press}
      onKeyDown={handleKeyDown}
      className={cn(base, stateClass, 'flex size-9 items-center justify-center rounded-lg border')}
    >
      <StateGlyph state={state} className="size-4" />
    </button>
  )
}

function StateGlyph({ state, className }: { state: ProgressState; className?: string }) {
  if (state === 'completed') return <Check className={className} strokeWidth={2.75} aria-hidden="true" />
  if (state === 'canceled') return <Minus className={className} strokeWidth={2.5} aria-hidden="true" />
  return <span aria-hidden="true" className="size-1 rounded-full bg-current" />
}
