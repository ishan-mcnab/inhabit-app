import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getCategoryBorderColor,
  getGoalCategoryDisplay,
} from '../constants/goalCategoryPills'
import { supabase } from '../supabase'

type GoalRow = {
  id: string
  title: string
  category: string | null
  target_date: string | null
  progress_percent: number
}

function formatTargetDate(isoDate: string | null): string {
  if (!isoDate) return '—'
  const parts = isoDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate
  const [y, m, d] = parts
  const local = new Date(y, m - 1, d)
  return local.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function clampPercent(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.min(100, Math.max(0, n))
}

export function Goals() {
  const [goals, setGoals] = useState<GoalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoading(false)
      setError(userError?.message ?? 'Not signed in')
      return
    }

    const { data, error: queryError } = await supabase
      .from('goals')
      .select('id,title,category,target_date,progress_percent')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    setLoading(false)

    if (queryError) {
      setError(queryError.message)
      return
    }

    setGoals((data ?? []) as GoalRow[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4">
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16">
            <p className="text-sm font-medium text-zinc-500">Loading goals…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="max-w-md text-center text-sm font-medium text-red-400">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-app-bg"
            >
              Retry
            </button>
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
            <p className="max-w-xs text-center text-sm font-medium text-zinc-500">
              No goals yet — tap + to create your first goal
            </p>
          </div>
        ) : (
          <ul className="mx-auto flex max-w-lg flex-col gap-3">
            {goals.map((goal) => {
              const { label, emoji } = getGoalCategoryDisplay(goal.category)
              const accent = getCategoryBorderColor(goal.category)
              const pct = clampPercent(goal.progress_percent)
              return (
                <li key={goal.id}>
                  <Link
                    to={`/goals/${goal.id}`}
                    className="block rounded-2xl outline-none ring-app-accent/0 transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-app-accent/50"
                  >
                    <article className="flex gap-3 rounded-2xl border border-zinc-800/80 bg-app-surface p-4 shadow-sm transition-colors hover:border-zinc-700/80">
                      <div
                        className="w-1 shrink-0 self-stretch rounded-full"
                        style={{ backgroundColor: accent }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-bold leading-snug text-white">
                          {goal.title}
                        </h2>
                        <p className="mt-2 text-sm font-semibold text-zinc-400">
                          <span aria-hidden>{emoji}</span>{' '}
                          <span className="text-zinc-300">{label}</span>
                        </p>
                        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Target{' '}
                          <span className="text-zinc-400">
                            {formatTargetDate(goal.target_date)}
                          </span>
                        </p>
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
                            <span>Progress</span>
                            <span className="tabular-nums text-zinc-400">
                              {pct}%
                            </span>
                          </div>
                          <div
                            className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800"
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label="Goal progress"
                          >
                            <div
                              className="h-full rounded-full bg-app-accent transition-[width] duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </article>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
