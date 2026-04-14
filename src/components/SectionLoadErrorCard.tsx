type Props = {
  sectionLabel: string
  message: string
  onRetry?: () => void
  retryLabel?: string
}

const SURFACE = '#141418'
const BORDER = 'rgba(255,255,255,0.08)'

export function SectionLoadErrorCard({
  sectionLabel,
  message,
  onRetry,
  retryLabel = 'Try again',
}: Props) {
  return (
    <div
      className="rounded-[8px] border p-3"
      style={{ backgroundColor: SURFACE, borderColor: BORDER }}
      role="alert"
    >
      <p className="text-[13px] font-semibold text-white">
        <span aria-hidden>{'\u26A0\uFE0F'} </span>
        Couldn&apos;t load {sectionLabel}
      </p>
      <p className="mt-1.5 text-xs leading-snug" style={{ color: '#888780' }}>
        {message}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border-2 border-[#534AB7] bg-transparent px-3 py-1.5 text-xs font-semibold text-[#534AB7] transition-colors hover:bg-[#534AB7]/10"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  )
}
