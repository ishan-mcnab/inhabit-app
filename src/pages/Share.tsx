import { Link } from 'react-router-dom'

/** Placeholder for Day 38 — full share flow. */
export function Share() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="shrink-0 border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Share My Stats
        </h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
        <p className="text-center text-sm font-medium text-zinc-500">
          Share screen coming soon.
        </p>
        <Link
          to="/profile"
          className="mt-6 text-sm font-bold text-app-accent underline-offset-2 hover:underline"
        >
          Back to Profile
        </Link>
      </div>
    </div>
  )
}
