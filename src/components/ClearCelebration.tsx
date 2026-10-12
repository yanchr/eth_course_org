import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { cn } from '../lib/cn'

interface ClearCelebrationProps {
  /** Semester week the board was cleared through. */
  week: number
  onDone: () => void
}

interface BurstMark {
  x: number
  y: number
  delay: number
  spin: number
  check: boolean
}

const BURST: BurstMark[] = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 - Math.PI / 2
  const dist = 108 + (i % 5) * 34
  return {
    x: Math.round(Math.cos(angle) * dist),
    y: Math.round(Math.sin(angle) * dist),
    delay: (i % 7) * 32,
    spin: (i % 2 === 0 ? 1 : -1) * (18 + (i % 4) * 14),
    check: i % 3 === 0,
  }
})

const HOLD_MS = 4400
const EXIT_MS = 220

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Full-screen beat when the open to-do count drops to zero. */
export function ClearCelebration({ week, onDone }: ClearCelebrationProps) {
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const buttonRef = useRef<HTMLButtonElement>(null)
  const reduced = useRef(prefersReducedMotion()).current
  const [closing, setClosing] = useState(false)
  const closed = useRef(false)

  const dismiss = () => {
    if (closed.current) return
    closed.current = true
    setClosing(true)
    window.setTimeout(() => onDoneRef.current(), reduced ? 0 : EXIT_MS)
  }
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    buttonRef.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const hold = window.setTimeout(() => dismissRef.current(), reduced ? 2600 : HOLD_MS)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        dismissRef.current()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(hold)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [reduced])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-celebration-title"
      className={cn(
        'fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950 text-white',
        closing ? 'pointer-events-none opacity-0 transition-opacity duration-200 ease-out' : 'animate-clear-in',
      )}
      onClick={dismiss}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,oklch(0.27_0_0)_0%,oklch(0.13_0_0)_62%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: 'radial-gradient(circle, oklch(1 0 0 / 0.09) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      {!reduced && (
        <>
          <span
            aria-hidden="true"
            className="animate-clear-ring pointer-events-none absolute top-1/2 left-1/2 size-[min(78vw,28rem)] rounded-full border border-emerald-400/80"
          />
          <span
            aria-hidden="true"
            className="animate-clear-ring pointer-events-none absolute top-1/2 left-1/2 size-[min(78vw,28rem)] rounded-full border border-white/25 [animation-delay:160ms]"
          />
          {BURST.map((mark, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="animate-clear-burst pointer-events-none absolute top-1/2 left-1/2 text-white"
              style={{
                ['--dx' as string]: `${mark.x}px`,
                ['--dy' as string]: `${mark.y}px`,
                ['--spin' as string]: `${mark.spin}deg`,
                animationDelay: `${mark.delay}ms`,
              }}
            >
              {mark.check ? (
                <Check className="size-4" strokeWidth={2.75} />
              ) : (
                <span className="block size-1.5 rounded-full bg-white/85" />
              )}
            </span>
          ))}
        </>
      )}

      <div className="relative flex flex-col items-center px-6 pt-[max(env(safe-area-inset-top),0px)] pb-[max(env(safe-area-inset-bottom),0px)] text-center">
        <p
          id="clear-celebration-title"
          className="animate-clear-rise text-[11px] font-semibold tracking-[0.42em] text-emerald-300 uppercase [animation-delay:180ms]"
        >
          All done
        </p>
        <p className="animate-clear-zero tabular mt-1 text-[clamp(7.5rem,38vw,16rem)] leading-none font-semibold tracking-tighter">
          0
        </p>
        <p className="animate-clear-rise mt-3 text-sm text-zinc-400 [animation-delay:340ms]">
          Nothing left through week {week}
        </p>
        <button
          ref={buttonRef}
          type="button"
          onClick={dismiss}
          className="animate-clear-rise mt-8 inline-flex h-11 items-center rounded-full border border-white/15 bg-white/10 px-5 text-sm font-medium text-zinc-200 [animation-delay:720ms] hover:bg-white/15 focus-visible:outline-white"
        >
          Continue
        </button>
      </div>
    </div>,
    document.body,
  )
}
