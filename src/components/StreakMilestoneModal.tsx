import { useEffect, useRef, useState } from 'react'

const OVERLAY = 'rgba(10, 15, 30, 0.9)'
const AMBER = '#EF9F27'
const ACCENT = '#F5A623'

type Props = {
  visible: boolean
  streakCount: number
  onClose: () => void
}

/**
 * Full-screen streak milestone (7, 14, 21…). Auto-closes after 5s.
 */
export function StreakMilestoneModal({ visible, streakCount, onClose }: Props) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [progress, setProgress] = useState(1)

  useEffect(() => {
    if (!visible) {
      setProgress(1)
      return
    }

    setProgress(1)
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setProgress(0))
    })

    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      onClose()
    }, 5000)

    return () => {
      cancelAnimationFrame(raf)
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [visible, onClose])

  function dismiss() {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    onClose()
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[320] flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: OVERLAY }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="streak-milestone-title"
    >
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="text-[64px] leading-none" aria-hidden>
          🔥
        </div>
        <h2
          id="streak-milestone-title"
          className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl"
        >
          {streakCount} DAY STREAK
        </h2>
        <p className="mt-4 text-base font-medium text-zinc-500">
          You&apos;re on fire. Keep showing up.
        </p>
        <div
          className="mx-auto mt-8 h-px w-[min(100%,14rem)]"
          style={{ backgroundColor: AMBER }}
          aria-hidden
        />
        <p
          className="mt-6 text-lg font-bold"
          style={{ color: AMBER }}
        >
          +100 XP Bonus
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-10 w-full max-w-xs rounded-xl py-3.5 text-sm font-bold transition-opacity active:opacity-90"
          style={{ backgroundColor: ACCENT, color: '#0A0F1E' }}
        >
          Keep Going
        </button>
        <div className="mt-8 w-full max-w-xs">
          <div
            className="h-0.5 w-full overflow-hidden rounded-full bg-zinc-800"
            aria-hidden
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress * 100}%`,
                backgroundColor: AMBER,
                transition: 'width 5s linear',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
