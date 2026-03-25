import { Link } from 'react-router-dom'

export function Goals() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold tracking-tight text-white">Goals</h1>
        <Link
          to="/goals/new"
          aria-label="Create new goal"
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-surface text-3xl font-light leading-none text-white shadow-lg shadow-black/25 ring-1 ring-zinc-800 transition-colors hover:bg-zinc-800/80 hover:ring-zinc-700"
        >
          <span aria-hidden className="-mt-1">
            +
          </span>
        </Link>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8">
        <p className="text-center text-sm font-medium text-zinc-500">
          Your goals will show here. Tap + to create one.
        </p>
      </div>
    </div>
  )
}
