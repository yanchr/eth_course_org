import { useEffect, useState } from 'react'

/** Current epoch ms, refreshed every `intervalMs` while `active`. */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const handle = window.setInterval(() => setNow(Date.now()), intervalMs)
    const onVisible = () => document.visibilityState === 'visible' && setNow(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(handle)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active, intervalMs])

  return now
}
