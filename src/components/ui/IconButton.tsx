import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

export function IconButton({ label, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-500',
        'transition-colors duration-150 ease-out hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
