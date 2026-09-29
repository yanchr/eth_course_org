import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export function Pill({ active, className, children, type = 'button', ...rest }: PillProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center justify-center rounded-full border px-3.5 text-sm font-medium select-none',
        'transition-colors duration-150 ease-out',
        active
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
