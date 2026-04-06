import type { CSSProperties } from 'react'

/** Flame / streak text color tiers (matches Today header streak). */
export function streakTierTextStyle(streak: number): CSSProperties {
  const n = Math.max(0, Math.floor(streak))
  if (n <= 6) return { color: '#ffffff' }
  if (n <= 13) return { color: '#FF6B35' }
  if (n <= 20) return { color: '#EF9F27' }
  return {
    color: '#534AB7',
    textShadow: '0 0 12px rgba(83, 74, 183, 0.55)',
  }
}
