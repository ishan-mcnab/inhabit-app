const OVERLAY_BG = 'rgba(13, 13, 15, 0.85)'
const CARD_BG = '#141418'
const PURPLE = '#534AB7'

type Props = {
  visible: boolean
  streakBeforeMiss: number
  gracePasses: number
  useInProgress: boolean
  onUseGracePass: () => void | Promise<void>
  onDismiss: () => void
}

export function GracePassModal({
  visible,
  streakBeforeMiss,
  gracePasses,
  useInProgress,
  onUseGracePass,
  onDismiss,
}: Props) {
  if (!visible) return null

  const hasPass = gracePasses > 0
  const passSubtext =
    gracePasses === 1
      ? '1 weekly pass remaining'
      : `${gracePasses} weekly passes remaining`

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ backgroundColor: OVERLAY_BG }}
      aria-modal="true"
      role="dialog"
      aria-labelledby="grace-pass-title"
      aria-describedby="grace-pass-desc"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-800/80 px-5 py-7 shadow-2xl ring-1 ring-zinc-800/40"
        style={{ backgroundColor: CARD_BG }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center text-5xl" aria-hidden>
          🛡️
        </div>
        <h2
          id="grace-pass-title"
          className="mt-4 text-center text-xl font-bold text-white"
        >
          Your streak is at risk
        </h2>
        <p
          id="grace-pass-desc"
          className="mt-3 text-center text-sm leading-relaxed text-zinc-500"
        >
          You had a {streakBeforeMiss} day streak. Don&apos;t let it die.
        </p>

        <div className="mt-8 space-y-3">
          {hasPass ? (
            <>
              <button
                type="button"
                disabled={useInProgress}
                onClick={() => void onUseGracePass()}
                className="w-full rounded-xl py-3.5 text-center text-sm font-bold text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: PURPLE }}
              >
                Use Grace Pass — Save My Streak
              </button>
              <p className="text-center text-xs text-zinc-500">
                -30 XP · {passSubtext}
              </p>
              <button
                type="button"
                disabled={useInProgress}
                onClick={onDismiss}
                className="w-full rounded-xl border border-zinc-800/90 bg-[#16161a] py-3.5 text-center text-sm font-semibold text-zinc-500 transition-colors hover:bg-zinc-900/80"
              >
                Accept the Reset
              </button>
            </>
          ) : (
            <>
              <p className="text-center text-sm text-zinc-500">
                No grace passes remaining this week
              </p>
              <button
                type="button"
                onClick={onDismiss}
                className="w-full rounded-xl py-3.5 text-center text-sm font-bold text-white transition-opacity active:opacity-90"
                style={{ backgroundColor: PURPLE }}
              >
                Accept the Reset
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
