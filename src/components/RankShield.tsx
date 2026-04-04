/** Shield path in 120×145 viewBox — scales to ~120×140 display. */
const SHIELD_D =
  'M 60 0 L 120 20 L 120 80 Q 120 130 60 145 Q 0 130 0 80 L 0 20 Z'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (hex.length === 7 && hex.startsWith('#')) {
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    if ([r, g, b].every((n) => !Number.isNaN(n))) return { r, g, b }
  }
  return { r: 136, g: 135, b: 128 }
}

function rankEmoji(rankName: string): string {
  switch (rankName) {
    case 'Recruit':
      return '🔘'
    case 'Soldier':
      return '🟢'
    case 'Warrior':
      return '🔵'
    case 'Elite':
      return '🟡'
    case 'Legend':
      return '🟣'
    default:
      return '🔘'
  }
}

type Props = {
  rankName: string
  accentColor: string
}

/**
 * Decorative weekly-rank shield (~120×140). Reusable on Profile / Progress.
 */
export function RankShield({ rankName, accentColor }: Props) {
  const rgb = hexToRgb(accentColor)
  const fillSoft = `rgba(${rgb.r},${rgb.g},${rgb.b},0.1)`
  const glow = `0 4px 20px rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`

  return (
    <div
      className="relative mx-auto flex justify-center"
      style={{
        width: 120,
        height: 140,
        filter: `drop-shadow(${glow})`,
      }}
    >
      <svg
        width="120"
        height="140"
        viewBox="0 0 120 145"
        className="absolute inset-0 block"
        aria-hidden
      >
        <path
          d={SHIELD_D}
          fill={fillSoft}
          stroke={accentColor}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center px-2 pt-[14px] text-center">
        <span className="text-[28px] leading-none" aria-hidden>
          {rankEmoji(rankName)}
        </span>
        <span className="mt-1 text-[18px] font-bold leading-tight text-white">
          {rankName}
        </span>
        <div
          className="mx-5 mt-2 h-px w-[70px] shrink-0 bg-zinc-500/50"
          aria-hidden
        />
        <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
          RANK
        </span>
      </div>
    </div>
  )
}
