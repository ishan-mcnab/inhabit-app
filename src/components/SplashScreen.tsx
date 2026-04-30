import { useEffect, useState } from 'react'

type Props = {
  /** When false, opacity animates to 0 over 0.4s, then `onFadeComplete` runs. */
  show: boolean
  onFadeComplete?: () => void
}

const BG = '#0A0F1E'
const ACCENT = '#F5A623'

export function SplashScreen({ show, onFadeComplete }: Props) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (show) setVisible(true)
  }, [show])

  return (
    <div
      className="fixed inset-0 z-[100000] flex flex-col items-center justify-center px-6"
      style={{
        backgroundColor: BG,
        opacity: show ? 1 : 0,
        transition: 'opacity 0.4s ease-out',
        pointerEvents: show ? 'auto' : 'none',
      }}
      onTransitionEnd={(e) => {
        if (e.propertyName !== 'opacity') return
        if (!show && visible) {
          setVisible(false)
          onFadeComplete?.()
        }
      }}
    >
      {visible ? (
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="relative inline-block">
            <div
              className="absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2"
              style={{
                width: 200,
                height: 80,
                background:
                  'radial-gradient(ellipse, rgba(245,166,35,0.4) 0%, transparent 70%)',
                filter: 'blur(20px)',
              }}
              aria-hidden
            />
            <h1
              className="relative z-[1] font-bold text-white"
              style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 48 }}
            >
              InHabit
            </h1>
          </div>

          <div
            className="mt-8 flex items-center justify-center gap-2"
            aria-hidden
          >
            <span
              className="splash-dot h-2 w-2 rounded-full"
              style={{ backgroundColor: ACCENT }}
            />
            <span
              className="splash-dot h-2 w-2 rounded-full"
              style={{ backgroundColor: ACCENT }}
            />
            <span
              className="splash-dot h-2 w-2 rounded-full"
              style={{ backgroundColor: ACCENT }}
            />
          </div>

          <p
            className="mt-10 max-w-sm text-center text-[14px] leading-relaxed"
            style={{ color: '#888780' }}
          >
            Build the life you keep promising yourself.
          </p>
        </div>
      ) : null}
    </div>
  )
}
