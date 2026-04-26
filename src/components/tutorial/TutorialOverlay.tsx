import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import {
  CalendarDays,
  ChartNoAxesCombined,
  Sun,
  Target,
  User,
  Check,
} from 'lucide-react'
import type { TutorialStep, TutorialTab } from '../../hooks/useTutorial'

type Props = {
  steps: TutorialStep[]
  currentStep: number
  onNext: () => void
  onSkip: () => void
  targetRef: RefObject<HTMLElement | null> | null
  isTabTransition: boolean
  transitionLabel: string
}

type Rect = { top: number; left: number; width: number; height: number }

const BACKDROP = 'rgba(0,0,0,0.82)'

function tabMeta(tab: TutorialTab) {
  switch (tab) {
    case 'today':
      return { label: 'Today', Icon: CalendarDays }
    case 'goals':
      return { label: 'Goals', Icon: Target }
    case 'lifestyle':
      return { label: 'Lifestyle', Icon: Sun }
    case 'progress':
      return { label: 'Progress', Icon: ChartNoAxesCombined }
    case 'profile':
      return { label: 'Profile', Icon: User }
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function TutorialOverlay({
  steps,
  currentStep,
  onNext,
  onSkip,
  targetRef,
  isTabTransition,
  transitionLabel,
}: Props) {
  const total = steps.length
  const step = steps[clamp(currentStep, 0, steps.length - 1)]

  const [rect, setRect] = useState<Rect | null>(null)
  const [tooltipTopLeft, setTooltipTopLeft] = useState<{
    top: number
    left: number
  } | null>(null)

  const isEndCard = step?.targetSelector === null && step?.heading === "You're set."

  const progressPct = useMemo(() => {
    if (total <= 0) return 0
    const v = ((currentStep + 1) / total) * 100
    return clamp(v, 0, 100)
  }, [currentStep, total])

  useLayoutEffect(() => {
    if (isTabTransition || isEndCard) {
      setRect(null)
      setTooltipTopLeft(null)
      return
    }

    const el = targetRef?.current ?? null
    if (!el) {
      setRect(null)
      setTooltipTopLeft(null)
      return
    }

    const r = el.getBoundingClientRect()
    const nextRect = {
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    }
    setRect(nextRect)

    const screenH = window.innerHeight
    const screenW = window.innerWidth
    const centerX = nextRect.left + nextRect.width / 2

    const preferAbove =
      nextRect.top + nextRect.height / 2 > screenH * 0.5 ||
      (screenW <= 375 && nextRect.top + nextRect.height / 2 > screenH * 0.4)

    const tooltipWidth = Math.min(300, Math.max(220, screenW - 32))
    const left = clamp(centerX - tooltipWidth / 2, 16, screenW - 16 - tooltipWidth)

    const gap = 12
    const estimatedHeight = 120
    const top = preferAbove
      ? clamp(nextRect.top - gap - estimatedHeight, 16, screenH - 16 - estimatedHeight)
      : clamp(
          nextRect.top + nextRect.height + gap,
          16,
          screenH - 16 - estimatedHeight,
        )

    setTooltipTopLeft({ top, left })
  }, [currentStep, isEndCard, isTabTransition, targetRef])

  useEffect(() => {
    if (isTabTransition || isEndCard) return
    const el = targetRef?.current ?? null
    if (!el) return
    el.classList.add('tutorial-highlight')
    return () => el.classList.remove('tutorial-highlight')
  }, [currentStep, isEndCard, isTabTransition, targetRef])

  useEffect(() => {
    if (isTabTransition || isEndCard) return
    const on = () => {
      const el = targetRef?.current ?? null
      if (!el) {
        setRect(null)
        setTooltipTopLeft(null)
        return
      }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    window.addEventListener('resize', on, { passive: true })
    window.addEventListener('scroll', on, true)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('scroll', on, true)
    }
  }, [isEndCard, isTabTransition, targetRef])

  const handleBackdropTap = () => {
    onNext()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial"
      onClick={handleBackdropTap}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: BACKDROP,
        }}
        aria-hidden
      />

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: 3,
          width: `${progressPct}%`,
          backgroundColor: '#534AB7',
          transition: 'width 0.3s ease',
        }}
        aria-hidden
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          void onSkip()
        }}
        style={{
          position: 'absolute',
          top: 'max(12px, env(safe-area-inset-top, 0px))',
          right: 14,
          zIndex: 10001,
          padding: '8px 10px',
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.78)',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Skip
      </button>

      {isTabTransition ? (
        <TabTransitionCard
          tab={step.tab}
          transitionLabel={transitionLabel}
          nextHeading={step.heading}
        />
      ) : isEndCard ? (
        <EndCard
          onGo={(e) => {
            e.stopPropagation()
            void onSkip()
          }}
        />
      ) : rect ? (
        <>
          <div
            style={{
              position: 'absolute',
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              borderRadius: 8,
              boxShadow: `0 0 0 9999px ${BACKDROP}, 0 0 0 2px rgba(83,74,183,0.6)`,
              pointerEvents: 'none',
            }}
            aria-hidden
          />
          <Tooltip
            heading={step.heading}
            copy={step.copy}
            top={tooltipTopLeft?.top ?? window.innerHeight / 2 - 70}
            left={tooltipTopLeft?.left ?? 16}
          />
        </>
      ) : (
        <Tooltip
          heading={step.heading}
          copy={step.copy}
          top={window.innerHeight / 2 - 70}
          left={Math.max(16, window.innerWidth / 2 - 150)}
          centered
        />
      )}
    </div>
  )
}

function Tooltip({
  heading,
  copy,
  top,
  left,
  centered,
}: {
  heading: string
  copy: string
  top: number
  left: number
  centered?: boolean
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: 'min(300px, calc(100vw - 32px))',
        maxWidth: 300,
        padding: '16px 20px',
        borderRadius: 12,
        backgroundColor: '#141418',
        border: '1px solid rgba(255,255,255,0.1)',
        zIndex: 10001,
        transform: centered ? 'translateX(-0%)' : undefined,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: '#ffffff' }}>
        {heading}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 13,
          fontWeight: 500,
          color: '#888780',
          lineHeight: 1.45,
        }}
      >
        {copy}
      </div>
    </div>
  )
}

function TabTransitionCard({
  tab,
  transitionLabel,
  nextHeading,
}: {
  tab: TutorialTab
  transitionLabel: string
  nextHeading: string
}) {
  const meta = tabMeta(tab)
  const Icon = meta.Icon
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
        pointerEvents: 'none',
      }}
      aria-hidden
    >
      <div style={{ textAlign: 'center', padding: 24, maxWidth: 320 }}>
        <Icon size={28} strokeWidth={2.25} color="#ffffff" />
        <div style={{ marginTop: 10, fontSize: 16, fontWeight: 700, color: '#fff' }}>
          {transitionLabel || `${meta.label} →`}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            fontWeight: 500,
            color: '#888780',
          }}
        >
          {nextHeading}
        </div>
      </div>
    </div>
  )
}

function EndCard({ onGo }: { onGo: (e: React.MouseEvent) => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ width: 'min(360px, calc(100vw - 48px))', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: 999,
            background: 'rgba(83,74,183,0.18)',
            border: '1px solid rgba(83,74,183,0.35)',
          }}
          aria-hidden
        >
          <Check size={40} strokeWidth={2.25} color="#534AB7" />
        </div>
        <div style={{ marginTop: 14, fontSize: 24, fontWeight: 800, color: '#fff' }}>
          You&apos;re set.
        </div>
        <div style={{ marginTop: 8, fontSize: 16, fontWeight: 600, color: '#888780' }}>
          Now go build something.
        </div>
        <button
          type="button"
          className="btn-press"
          onClick={onGo}
          style={{
            marginTop: 18,
            width: '100%',
            height: 52,
            borderRadius: 14,
            border: 'none',
            backgroundColor: '#534AB7',
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Let&apos;s go
        </button>
      </div>
    </div>
  )
}

