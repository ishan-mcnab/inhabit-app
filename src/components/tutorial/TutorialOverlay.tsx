import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Flag,
  Sun,
  TrendingUp,
  User,
} from 'lucide-react'
import type { TutorialStep } from '../../hooks/useTutorial'

type Props = {
  steps: TutorialStep[]
  currentStep: number
  onNext: () => void
  onSkip: () => void
}

const BG = '#0A0F1E'
const ACCENT = '#F5A623'
const MUTED = '#888780'

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function iconFor(step: TutorialStep) {
  switch (step.icon) {
    case 'CalendarDays':
      return CalendarDays
    case 'Flag':
      return Flag
    case 'Sun':
      return Sun
    case 'TrendingUp':
      return TrendingUp
    case 'User':
      return User
    case 'CheckCircle2':
      return CheckCircle2
  }
}

export function TutorialOverlay({ steps, currentStep, onNext, onSkip }: Props) {
  const total = steps.length
  const idx = clamp(currentStep, 0, Math.max(0, total - 1))
  const step = steps[idx]
  const isEndCard = step.id === 6

  const progressPct = useMemo(() => {
    // Progress reflects 5 slides (end card is separate).
    const slidesTotal = 5
    const clampedSlide = clamp(idx, 0, slidesTotal)
    return clamp(
      ((Math.min(clampedSlide, slidesTotal - 1) + 1) / slidesTotal) * 100,
      0,
      100,
    )
  }, [idx])

  const [phase, setPhase] = useState<'in' | 'out'>('in')

  useEffect(() => {
    setPhase('in')
  }, [idx])

  const slideStyle = useMemo(() => {
    if (phase === 'out') {
      return {
        opacity: 0,
        transform: 'translateX(-20px)',
        transition: 'opacity 150ms ease, transform 150ms ease',
      } as const
    }
    return {
      opacity: 1,
      transform: 'translateX(0px)',
      transition: 'opacity 200ms ease, transform 200ms ease',
    } as const
  }, [phase])

  const handleAdvance = () => {
    if (phase === 'out') return
    setPhase('out')
    window.setTimeout(() => onNext(), 150)
  }

  const Icon = iconFor(step)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: `${BG}`,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial"
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(245,166,35,0.12) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
        aria-hidden
      />

      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: 3,
          width: `${progressPct}%`,
          backgroundColor: ACCENT,
          transition: 'width 0.3s ease',
          zIndex: 10001,
        }}
        aria-hidden
      />

      <button
        type="button"
        onClick={() => void onSkip()}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          padding: 16,
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.78)',
          fontSize: 13,
          fontWeight: 600,
          zIndex: 10001,
          cursor: 'pointer',
        }}
      >
        Skip
      </button>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 'max(40px, env(safe-area-inset-top, 0px) + 16px)',
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
          ...slideStyle,
        }}
      >
        {/* Center section */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 24,
            paddingBottom: 16,
            width: '100%',
          }}
        >
          {isEndCard ? (
            <>
              <CheckCircle2
                size={64}
                color={ACCENT}
                strokeWidth={2.25}
                aria-hidden
              />
              <div
                style={{
                  marginTop: 18,
                  fontSize: 28,
                  fontWeight: 800,
                  color: '#fff',
                  textAlign: 'center',
                }}
              >
                You&apos;re set.
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  color: MUTED,
                  textAlign: 'center',
                }}
              >
                Now go build something.
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  height: 80,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-hidden
              >
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 999,
                    background: 'rgba(245,166,35,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={48} color={ACCENT} strokeWidth={2.25} />
                </div>
              </div>

              <div
                style={{
                  marginTop: 24,
                  maxWidth: 280,
                  textAlign: 'center',
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#ffffff',
                  lineHeight: 1.15,
                }}
              >
                {step.heading}
              </div>

              <div
                style={{
                  marginTop: 12,
                  maxWidth: 300,
                  textAlign: 'center',
                  fontSize: 15,
                  fontWeight: 500,
                  color: MUTED,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line',
                }}
              >
                {step.copy}
              </div>

              {step.tab ? (
                <div
                  style={{
                    marginTop: 14,
                    padding: '6px 10px',
                    borderRadius: 999,
                    backgroundColor: '#111827',
                    border: '1px solid rgba(245,166,35,0.45)',
                    color: '#F5A623',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {step.tab}
                </div>
              ) : null}

              <div style={{ height: 22 }} />
              <Dots current={idx} />
            </>
          )}
        </div>

        {/* Bottom section */}
        <button
          type="button"
          className="btn-press"
          onClick={() => {
            if (isEndCard) {
              void onSkip()
              return
            }
            handleAdvance()
          }}
          style={{
            width: 'min(520px, calc(100vw - 32px))',
            height: 52,
            borderRadius: 14,
            border: 'none',
            backgroundColor: ACCENT,
            color: '#0A0F1E',
            fontSize: 15,
            fontWeight: 800,
            cursor: 'pointer',
            alignSelf: 'center',
            marginBottom: 4,
          }}
        >
          {isEndCard ? "Let's go" : 'Next →'}
        </button>
      </div>
    </div>
  )
}

function Dots({ current }: { current: number }) {
  const count = 5
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingBottom: 2,
      }}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: i === current ? ACCENT : '#2a2a2e',
          }}
        />
      ))}
    </div>
  )
}

