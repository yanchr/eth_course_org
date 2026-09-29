import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export const inputClass = cn(
  'h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400',
  'transition-colors duration-150 ease-out hover:border-zinc-300',
  'focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10',
)

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
}

export function Field({ label, hint, className, id, ...rest }: FieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-xs font-medium text-zinc-500">
        {label}
      </label>
      <input id={inputId} className={inputClass} {...rest} />
      {hint && <div className="text-xs text-zinc-500">{hint}</div>}
    </div>
  )
}
