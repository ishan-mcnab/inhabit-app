import { useEffect, useState } from 'react'

const BG = '#141418'
const BORDER = 'rgba(255,255,255,0.08)'
const XP_COLOR = '#EF9F27'

type Props = {
  amount: number
  visible: boolean
  onHide: () => void
}

type Phase = 'gone' | 'enter' | 'shown' | 'leave'

/**
 * Pill toast near top: slide down + fade in, hold 1.5s, fade out, then onHide().
 */
export function XPToast({ amount, visible, onHide }: Props) {
  const [phase, setPhase] = useState<Phase>('enter')

  useEffect(() => {
    if (!visible) {
      setPhase('gone')
      return
    }

    setPhase('enter')
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('shown'))
    })

    const leaveTimer = window.setTimeout(() => setPhase('leave'), 1500)
    const hideTimer = window.setTimeout(() => {
      onHide()
    }, 1500 + 320)

    return () => {
      cancelAnimationFrame(raf1)
      window.clearTimeout(leaveTimer)
      window.clearTimeout(hideTimer)
    }
  }, [visible, amount, onHide])

  if (!visible) return null

  const motion =
    phase === 'enter'
      ? '-translate-y-3 opacity-0'
      : phase === 'shown'
        ? 'translate-y-0 opacity-100'
        : phase === 'leave'
          ? '-translate-y-1 opacity-0'
          : '-translate-y-3 opacity-0'

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-[200] flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="status"
      aria-live="polite"
    >
      <div
        className={[
          'rounded-full border px-5 py-2.5 shadow-lg transition-[opacity,transform] duration-300 ease-out',
          motion,
        ].join(' ')}
        style={{
          backgroundColor: BG,
          borderColor: BORDER,
        }}
      >
        <span
          className="text-sm font-bold tabular-nums tracking-tight"
          style={{ color: XP_COLOR }}
        >
          +{amount} XP
        </span>
      </div>
    </div>
  )
}
