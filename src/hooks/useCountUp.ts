import { useEffect, useRef, useState } from 'react'

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

/**
 * Animates from 0 to `target` on first run. When `target` changes later (e.g. after
 * refresh), snaps to the new value so stats stay correct.
 */
export function useCountUp(
  target: number,
  duration: number = 600,
  startOnMount: boolean = true,
): number {
  const [value, setValue] = useState(0)
  const completedRef = useRef(false)
  const rafRef = useRef(0)

  useEffect(() => {
    const to = Math.max(0, Math.floor(target))

    if (completedRef.current) {
      setValue(to)
      return
    }

    if (!startOnMount) {
      setValue(to)
      completedRef.current = true
      return
    }

    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const rawT = Math.min(1, duration <= 0 ? 1 : elapsed / duration)
      const t = easeOutQuart(rawT)
      setValue(Math.round(to * t))
      if (rawT < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setValue(to)
        completedRef.current = true
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration, startOnMount])

  return value
}
