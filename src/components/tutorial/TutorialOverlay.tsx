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

  const isEndCard = step?.targetSelector === null && step?.heading === "You're set."

  const progressPct = useMemo(() => {
    if (total <= 0) return 0
    const v = ((currentStep + 1) / total) * 100
    return clamp(v, 0, 100)
  }, [currentStep, total])

  useLayoutEffect(() => {
    if (isTabTransition || isEndCard) {
      setRect(null)
      return
    }

    const el = targetRef?.current ?? null
    if (!el) {
      setRect(null)
      return
    }

    const r = el.getBoundingClientRect()
    setRect({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    })
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

  const tooltipPlacement = useMemo(() => {
    if (!rect) return { mode: 'center' as const, top: 0 }
    const screenH = window.innerHeight
    const below = rect.top + rect.height
    const shouldGoBelow = below < screenH * 0.6
    const gap = 14
    return {
      mode: 'anchored' as const,
      top: shouldGoBelow ? below + gap : rect.top - gap,
      above: !shouldGoBelow,
    }
  }, [rect])

  const overlayPieces = useMemo(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight

    if (!rect) {
      return {
        top: { left: 0, top: 0, width: vw, height: vh },
        left: { left: 0, top: 0, width: 0, height: 0 },
        right: { left: vw, top: 0, width: 0, height: 0 },
        bottom: { left: 0, top: vh, width: vw, height: 0 },
      }
    }

    const topH = Math.max(0, rect.top)
    const bottomTop = Math.max(0, rect.top + rect.height)
    const bottomH = Math.max(0, vh - bottomTop)
    const leftW = Math.max(0, rect.left)
    const rightLeft = Math.max(0, rect.left + rect.width)
    const rightW = Math.max(0, vw - rightLeft)

    return {
      top: { left: 0, top: 0, width: vw, height: topH },
      bottom: { left: 0, top: bottomTop, width: vw, height: bottomH },
      left: { left: 0, top: rect.top, width: leftW, height: rect.height },
      right: { left: rightLeft, top: rect.top, width: rightW, height: rect.height },
    }
  }, [rect])

  return (
    <>
      <button
        type="button"
        onClick={() => onNext()}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9997,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
        aria-label="Next tutorial step"
      />

      {/* Four-piece surround overlay (transparent hole) */}
      <div
        style={{
          position: 'fixed',
          left: overlayPieces.top.left,
          top: overlayPieces.top.top,
          width: overlayPieces.top.width,
          height: overlayPieces.top.height,
          background: BACKDROP,
          zIndex: 9998,
          pointerEvents: 'none',
        }}
        aria-hidden
      />
      <div
        style={{
          position: 'fixed',
          left: overlayPieces.bottom.left,
          top: overlayPieces.bottom.top,
          width: overlayPieces.bottom.width,
          height: overlayPieces.bottom.height,
          background: BACKDROP,
          zIndex: 9998,
          pointerEvents: 'none',
        }}
        aria-hidden
      />
      <div
        style={{
          position: 'fixed',
          left: overlayPieces.left.left,
          top: overlayPieces.left.top,
          width: overlayPieces.left.width,
          height: overlayPieces.left.height,
          background: BACKDROP,
          zIndex: 9998,
          pointerEvents: 'none',
        }}
        aria-hidden
      />
      <div
        style={{
          position: 'fixed',
          left: overlayPieces.right.left,
          top: overlayPieces.right.top,
          width: overlayPieces.right.width,
          height: overlayPieces.right.height,
          background: BACKDROP,
          zIndex: 9998,
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
          backgroundColor: '#534AB7',
          transition: 'width 0.3s ease',
          zIndex: 10001,
        }}
        aria-hidden
      />

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          void onSkip()
        }}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 10001,
          padding: '6px 14px',
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20,
          color: 'rgba(255,255,255,0.86)',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Skip
      </button>

      {/* Highlight border around the hole */}
      {rect ? (
        <div
          style={{
            position: 'fixed',
            left: rect.left - 2,
            top: rect.top - 2,
            width: rect.width + 4,
            height: rect.height + 4,
            border: '2px solid rgba(83,74,183,0.8)',
            borderRadius: 10,
            boxShadow: '0 0 16px rgba(83,74,183,0.4)',
            pointerEvents: 'none',
            zIndex: 9999,
            background: 'transparent',
          }}
          aria-hidden
        />
      ) : null}

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
      ) : (
        <Tooltip
          heading={step.heading}
          copy={step.copy}
          rect={rect}
          placement={tooltipPlacement}
        />
      )}
    </>
  )
}

function Tooltip({
  heading,
  copy,
  rect,
  placement,
}: {
  heading: string
  copy: string
  rect: Rect | null
  placement:
    | { mode: 'center' }
    | { mode: 'anchored'; top: number; above: boolean }
}) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxWidth = Math.min(300, Math.floor(vw * 0.9))
  const left = Math.round((vw - maxWidth) / 2)

  let top = Math.round(vh / 2 - 70)
  if (placement.mode === 'anchored' && rect) {
    const approxHeight = 118
    top = placement.above
      ? Math.max(16, placement.top - approxHeight)
      : Math.min(vh - 16 - approxHeight, placement.top)
    // If anchored-above, `placement.top` is the rect.top - gap. We used approx height.
    // If anchored-below, `placement.top` is rect.bottom + gap.
  }

  return (
    <div
      style={{
        position: 'fixed',
        top,
        left,
        width: maxWidth,
        padding: '16px 20px',
        borderRadius: 12,
        backgroundColor: '#1a1a1e',
        border: '1px solid rgba(255,255,255,0.12)',
        zIndex: 10000,
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
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
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
        position: 'fixed',
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

