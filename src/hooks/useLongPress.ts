import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'

interface Options {
  onTap: () => void
  onLongPress: () => void
  delay?: number
}

const MOVE_TOLERANCE_PX = 10

/**
 * Tap / click / Enter / Space -> onTap.
 * Long-press, right-click, Shift+click, Backspace/Delete -> onLongPress.
 */
export function useLongPress({ onTap, onLongPress, delay = 500 }: Options) {
  const timer = useRef<number | null>(null)
  const fired = useRef(false)
  const origin = useRef<{ x: number; y: number } | null>(null)

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    origin.current = null
  }, [])

  useEffect(() => clear, [clear])

  const trigger = useCallback(() => {
    fired.current = true
    clear()
    navigator.vibrate?.(12)
    onLongPress()
  }, [clear, onLongPress])

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return
      fired.current = false
      origin.current = { x: e.clientX, y: e.clientY }
      timer.current = window.setTimeout(trigger, delay)
    },
    onPointerMove: (e: PointerEvent) => {
      if (!origin.current) return
      const dx = Math.abs(e.clientX - origin.current.x)
      const dy = Math.abs(e.clientY - origin.current.y)
      if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) clear()
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault()
      if (fired.current) return
      trigger()
    },
    onClick: (e: MouseEvent) => {
      if (fired.current) {
        fired.current = false
        return
      }
      if (e.shiftKey) onLongPress()
      else onTap()
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        onLongPress()
      }
    },
  }
}
