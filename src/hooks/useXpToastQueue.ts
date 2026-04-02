import { useCallback, useRef, useState } from 'react'

/**
 * Queue XP toasts one at a time. Do not push+shift inside setState updaters —
 * React Strict Mode may run updaters twice in dev and would drain the queue.
 */
export function useXpToastQueue() {
  const queueRef = useRef<number[]>([])
  const [toast, setToast] = useState<{ key: number; amount: number } | null>(
    null,
  )

  const enqueueXpToast = useCallback((amount: number) => {
    setToast((cur) => {
      if (cur !== null) {
        queueRef.current.push(amount)
        return cur
      }
      return { key: Date.now(), amount }
    })
  }, [])

  const onXpToastHide = useCallback(() => {
    setToast(null)
    requestAnimationFrame(() => {
      const next = queueRef.current.shift()
      if (next !== undefined) {
        setToast({ key: Date.now(), amount: next })
      }
    })
  }, [])

  return { toast, enqueueXpToast, onXpToastHide }
}
