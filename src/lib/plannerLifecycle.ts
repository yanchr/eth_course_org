/** Flush before suspension and recheck the real date when the PWA resumes. */
export function subscribePlannerLifecycle(flush: () => void, refresh: () => void): () => void {
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush()
    else if (document.visibilityState === 'visible') refresh()
  }
  window.addEventListener('pagehide', flush)
  window.addEventListener('pageshow', refresh)
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', onVisibilityChange)
  const interval = window.setInterval(refresh, 60_000)
  refresh()
  return () => {
    window.clearInterval(interval)
    window.removeEventListener('pagehide', flush)
    window.removeEventListener('pageshow', refresh)
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
