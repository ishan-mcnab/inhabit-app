import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  GOAL_PURPLE,
  getCategoryBorderColor,
  getGoalCategoryDisplay,
} from '../constants/goalCategoryPills'
import { suggestGoals, type SuggestedGoal } from '../lib/suggestGoals'
import { supabase } from '../supabase'

type GoalRow = {
  id: string
  title: string
  category: string | null
  target_date: string | null
  progress_percent: number
}

const FITNESS_QUICK_HABITS = [
  { title: '🏋️ Hit the gym' },
  { title: '🥗 Hit protein target' },
  { title: "📝 Log today's training" },
] as const

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
  const navigate = useNavigate()
  const [goals, setGoals] = useState<GoalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fitnessHabitTitles, setFitnessHabitTitles] = useState<Set<string>>(
    () => new Set(),
  )
  const [addingHabitKey, setAddingHabitKey] = useState<string | null>(null)

  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestPhase, setSuggestPhase] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestedGoal[]>([])

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

    const [{ data, error: queryError }, habitsRes] = await Promise.all([
      supabase
        .from('goals')
        .select('id,title,category,target_date,progress_percent')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('habits')
        .select('title')
        .eq('user_id', user.id)
        .eq('category', 'fitness_consistency'),
    ])

    setLoading(false)

    if (queryError) {
      setError(queryError.message)
      return
    }

    setGoals((data ?? []) as GoalRow[])

    const titles = new Set<string>()
    for (const row of habitsRes.data ?? []) {
      if (row.title) titles.add(row.title)
    }
    setFitnessHabitTitles(titles)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleQuickFitnessHabit(title: string) {
    if (fitnessHabitTitles.has(title)) return
    setAddingHabitKey(title)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      setAddingHabitKey(null)
      return
    }
    const { error: insertError } = await supabase.from('habits').insert({
      user_id: user.id,
      title,
      category: 'fitness_consistency',
      frequency: 'daily',
    })
    setAddingHabitKey(null)
    if (!insertError) {
      setFitnessHabitTitles((prev) => new Set(prev).add(title))
      void navigate('/today')
    }
  }

  async function openSuggestions() {
    setSuggestOpen(true)
    setSuggestPhase('loading')
    setSuggestError(null)
    setSuggestions([])

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setSuggestPhase('error')
      setSuggestError(userError?.message ?? 'Not signed in')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('goal_categories, goal_context')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      setSuggestPhase('error')
      setSuggestError(profileError.message)
      return
    }

    const categories = profile?.goal_categories ?? []
    const ctx =
      profile?.goal_context &&
      typeof profile.goal_context === 'object' &&
      !Array.isArray(profile.goal_context)
        ? (profile.goal_context as Record<string, unknown>)
        : {}

    try {
      const list = await suggestGoals(categories, ctx)
      setSuggestions(list)
      setSuggestPhase('ready')
    } catch (e) {
      setSuggestPhase('error')
      setSuggestError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  function closeSuggestions() {
    setSuggestOpen(false)
    setSuggestPhase('idle')
    setSuggestError(null)
  }

  function addSuggestedGoal(sg: SuggestedGoal) {
    closeSuggestions()
    void navigate('/goals/new', {
      state: {
        createGoalPrefill: {
          title: sg.title,
          category: sg.category,
          description: sg.description,
          suggestedDuration: sg.suggestedDuration,
        },
      },
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="min-w-0 flex-1 text-2xl font-bold tracking-tight text-white">
          Goals
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void openSuggestions()}
            className="rounded-xl border-2 px-3 py-2.5 text-sm font-bold text-white transition-colors active:scale-[0.98]"
            style={{ borderColor: GOAL_PURPLE, color: GOAL_PURPLE }}
          >
            ✨ Suggest goals
          </button>
          <Link
            to="/goals/new"
            aria-label="Create new goal"
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-surface text-3xl font-light leading-none text-white shadow-lg shadow-black/25 ring-1 ring-zinc-800 transition-colors hover:bg-zinc-800/80 hover:ring-zinc-700"
          >
            <span aria-hidden className="-mt-1">
              +
            </span>
          </Link>
        </div>
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
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
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

        <section className="mx-auto mt-10 max-w-lg border-t border-zinc-800/60 pt-8">
          <h2 className="text-lg font-bold text-white">Fitness Habits</h2>
          <p className="mt-1.5 text-sm font-medium leading-snug text-zinc-500">
            Track your consistency — bring your own program.
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            {FITNESS_QUICK_HABITS.map((h) => {
              const has = fitnessHabitTitles.has(h.title)
              const busy = addingHabitKey === h.title
              if (has) {
                return (
                  <div
                    key={h.title}
                    className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm font-semibold text-zinc-400"
                  >
                    <span className="text-emerald-400" aria-hidden>
                      ✓
                    </span>
                    Added — {h.title}
                  </div>
                )
              }
              return (
                <button
                  key={h.title}
                  type="button"
                  disabled={busy || loading}
                  onClick={() => void handleQuickFitnessHabit(h.title)}
                  className="rounded-xl border border-zinc-700 bg-app-surface px-4 py-3.5 text-left text-sm font-bold text-white transition-colors hover:border-zinc-600 active:scale-[0.99] disabled:opacity-50"
                >
                  {busy ? 'Adding…' : h.title}
                </button>
              )
            })}
          </div>
        </section>
      </div>

      {suggestOpen ? (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/65 p-0"
          role="dialog"
          aria-modal="true"
          aria-label="Suggested goals"
        >
          <button
            type="button"
            aria-label="Close"
            className="min-h-0 flex-1"
            onClick={closeSuggestions}
          />
          <div className="max-h-[88vh] overflow-hidden rounded-t-3xl border border-zinc-800 border-b-0 bg-app-bg shadow-2xl">
            <div className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-zinc-700 mt-3 mb-2" />
            <div className="max-h-[calc(88vh-2rem)] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
              <h2 className="text-center text-lg font-bold text-white">
                Suggested goals
              </h2>

              {suggestPhase === 'loading' ? (
                <p className="mt-8 text-center text-sm font-medium text-zinc-400">
                  Finding goals for you...
                </p>
              ) : null}

              {suggestPhase === 'error' ? (
                <p className="mt-6 text-center text-sm font-medium text-red-400">
                  {suggestError ?? 'Could not load suggestions'}
                </p>
              ) : null}

              {suggestPhase === 'ready' ? (
                <ul className="mt-5 flex flex-col gap-4 pb-2">
                  {suggestions.map((sg, idx) => {
                    const { label, emoji } = getGoalCategoryDisplay(sg.category)
                    return (
                      <li
                        key={`${sg.title}-${idx}`}
                        className="rounded-2xl border border-zinc-800 bg-app-surface p-4"
                      >
                        <h3 className="text-base font-bold text-white">
                          {sg.title}
                        </h3>
                        <p className="mt-2 text-sm font-semibold text-zinc-300">
                          <span aria-hidden>{emoji}</span> {label}
                        </p>
                        <p className="mt-2 text-sm leading-snug text-zinc-500">
                          {sg.description}
                        </p>
                        <span className="mt-3 inline-block rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold uppercase tracking-wide text-zinc-300">
                          {sg.suggestedDuration}
                        </span>
                        <button
                          type="button"
                          onClick={() => addSuggestedGoal(sg)}
                          className="mt-4 w-full rounded-xl py-3 text-sm font-bold text-white"
                          style={{ backgroundColor: GOAL_PURPLE }}
                        >
                          Add this goal
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}

              <button
                type="button"
                onClick={closeSuggestions}
                className="mt-4 w-full pb-2 text-center text-sm font-semibold text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              >
                No thanks, I&apos;ll create my own
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
