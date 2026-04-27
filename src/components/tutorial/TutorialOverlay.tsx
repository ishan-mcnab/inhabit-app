import { useEffect, useMemo, useState } from 'react'
import {
  Award,
  BarChart2,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  Flag,
  Moon,
  PenLine,
  Repeat,
  Shield,
  Sparkles,
  Sun,
  TrendingUp,
  Zap,
} from 'lucide-react'
import type { TutorialStep } from '../../hooks/useTutorial'

type Props = {
  steps: TutorialStep[]
  currentStep: number
  onNext: () => void
  onSkip: () => void
}

const BG = '#0D0D0F'
const PURPLE = '#534AB7'
const MUTED = '#888780'

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function iconFor(step: TutorialStep) {
  switch (step.icon) {
    case 'BarChart2':
      return BarChart2
    case 'CheckSquare':
      return CheckSquare
    case 'Zap':
      return Zap
    case 'Repeat':
      return Repeat
    case 'Flag':
      return Flag
    case 'Sparkles':
      return Sparkles
    case 'PenLine':
      return PenLine
    case 'Sun':
      return Sun
    case 'Moon':
      return Moon
    case 'TrendingUp':
      return TrendingUp
    case 'BookOpen':
      return BookOpen
    case 'Shield':
      return Shield
    case 'Award':
      return Award
    case 'CheckCircle2':
      return CheckCircle2
  }
}

export function TutorialOverlay({ steps, currentStep, onNext, onSkip }: Props) {
  const total = steps.length
  const idx = clamp(currentStep, 0, Math.max(0, total - 1))
  const step = steps[idx]
  const isEndCard = step.id === 14

  const progressPct = useMemo(() => {
    if (total <= 0) return 0
    return clamp(((idx + 1) / total) * 100, 0, 100)
  }, [idx, total])

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
            'radial-gradient(ellipse at 50% 0%, rgba(83,74,183,0.15) 0%, transparent 60%)',
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
          backgroundColor: PURPLE,
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
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 'max(56px, env(safe-area-inset-top, 0px) + 24px)',
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
          ...slideStyle,
        }}
      >
        {isEndCard ? (
          <EndCard onGo={() => void onSkip()} />
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
                  background: 'rgba(83,74,183,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={48} color={PURPLE} strokeWidth={2.25} />
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
                  backgroundColor: '#141418',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.72)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {step.tab} tab
              </div>
            ) : null}

            <div style={{ flex: 1 }} />

            <Dots current={idx} total={total} />

            <button
              type="button"
              className="btn-press"
              onClick={handleAdvance}
              style={{
                marginTop: 14,
                width: 'min(520px, calc(100vw - 32px))',
                height: 52,
                borderRadius: 14,
                border: 'none',
                backgroundColor: PURPLE,
                color: '#fff',
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
                alignSelf: 'center',
              }}
            >
              {idx >= total - 1 ? "Let's go" : 'Next →'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Dots({ current, total }: { current: number; total: number }) {
  const count = Math.max(0, total - 1) // end card excludes dots
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
            backgroundColor: i === current ? PURPLE : '#2a2a2e',
          }}
        />
      ))}
    </div>
  )
}

function EndCard({ onGo }: { onGo: () => void }) {
  return (
    <>
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          width: 'min(420px, 100%)',
        }}
      >
        <CheckCircle2 size={64} color={PURPLE} strokeWidth={2.25} aria-hidden />
        <div
          style={{
            marginTop: 18,
            fontSize: 28,
            fontWeight: 800,
            color: '#fff',
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
          }}
        >
          Now go build something.
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        className="btn-press"
        onClick={onGo}
        style={{
          width: 'min(520px, calc(100vw - 32px))',
          height: 52,
          borderRadius: 14,
          border: 'none',
          backgroundColor: PURPLE,
          color: '#fff',
          fontSize: 15,
          fontWeight: 800,
          cursor: 'pointer',
          alignSelf: 'center',
        }}
      >
        Let&apos;s go
      </button>
    </>
  )
}

