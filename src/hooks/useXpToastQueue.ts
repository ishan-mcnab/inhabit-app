import { useCallback, useRef, useState } from 'react'

export type PillToastPayload =
  | { kind: 'xp'; amount: number }
  | { kind: 'streak'; message: string; accentColor: string }

type Queued = { key: number; payload: PillToastPayload }

/**
 * Queue pill toasts one at a time (XP amounts and streak messages).
 * Do not push+shift inside setState updaters — Strict Mode may run updaters twice in dev.
 */
export function useXpToastQueue() {
  const queueRef = useRef<PillToastPayload[]>([])
  const [toast, setToast] = useState<Queued | null>(null)

  const enqueueXpToast = useCallback((amount: number) => {
    const item: PillToastPayload = { kind: 'xp', amount }
    setToast((cur) => {
      if (cur !== null) {
        queueRef.current.push(item)
        return cur
      }
      return { key: Date.now(), payload: item }
    })
  }, [])

  const enqueueStreakToast = useCallback((message: string, accentColor: string) => {
    const item: PillToastPayload = { kind: 'streak', message, accentColor }
    setToast((cur) => {
      if (cur !== null) {
        queueRef.current.push(item)
        return cur
      }
      return { key: Date.now(), payload: item }
    })
  }, [])

  const onXpToastHide = useCallback(() => {
    setToast(null)
    requestAnimationFrame(() => {
      const next = queueRef.current.shift()
      if (next !== undefined) {
        setToast({ key: Date.now(), payload: next })
      }
    })
  }, [])

  return { toast, enqueueXpToast, enqueueStreakToast, onXpToastHide }
}
