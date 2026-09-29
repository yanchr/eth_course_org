import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface Option<T extends string> {
  value: T
  label: ReactNode
  ariaLabel?: string
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  const index = options.findIndex((o) => o.value === value)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next = index
    if (e.key === 'ArrowRight') next = (index + 1) % options.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + options.length) % options.length
    else return
    e.preventDefault()
    onChange(options[next].value)
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button')
    buttons[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('flex rounded-xl border border-zinc-200 bg-zinc-100/70 p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg text-sm font-medium select-none',
              'transition-colors duration-150 ease-out',
              active ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-500 hover:text-zinc-900',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
