import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getGoalCategoryDisplay } from '../constants/goalCategoryPills'
import { getMissionBoardAccent } from '../constants/missionBoardAccents'
import { supabase } from '../supabase'

const QUEST_PURPLE = '#534AB7'

type GoalRow = {
  id: string
  title: string
  category: string | null
  target_date: string | null
  progress_percent: number
}

type WeeklyQuestRow = {
  id: string
  goal_id: string
  title: string
  week_number: number
  completed: boolean
}

function formatDueDate(isoDate: string | null): string {
  if (!isoDate) return '—'
  const parts = isoDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate
  const [y, m, d] = parts
  const local = new Date(y, m - 1, d)
  return local.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function clampPercent(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.min(100, Math.max(0, n))
}

function pickCurrentWeekQuest(quests: WeeklyQuestRow[]): WeeklyQuestRow | null {
  if (quests.length === 0) return null
  if (quests.every((q) => !q.completed)) return quests[0]
  const firstIncomplete = quests.find((q) => !q.completed)
  return firstIncomplete ?? quests[quests.length - 1]
}

function progressFromQuests(quests: WeeklyQuestRow[]): number {
  const n = quests.length
  if (n === 0) return 0
  const done = quests.filter((q) => q.completed).length
  return Math.round((done / n) * 100)
}

function DetailSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 px-4 pb-10 pt-2">
      <div className="mission-skeleton-shell h-8 w-[75%] max-w-md rounded-lg" />
      <div className="h-4 w-40 rounded-lg bg-[#1e1e22] mission-skeleton-shell" />
      <div className="h-4 w-56 rounded-lg bg-[#1e1e22] mission-skeleton-shell" />
      <div className="mt-2 h-3 w-full max-w-lg rounded-full bg-zinc-800" />
      <div className="mt-8">
        <div className="h-5 w-40 rounded bg-zinc-800" />
        <div className="mission-skeleton-shell mt-4 min-h-[100px] rounded-2xl" />
      </div>
      <div className="mt-4">
        <div className="h-5 w-28 rounded bg-zinc-800" />
        <div className="mt-3 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="mission-skeleton-shell h-14 rounded-xl"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  )
}

export function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [goal, setGoal] = useState<GoalRow | null>(null)
  const [quests, setQuests] = useState<WeeklyQuestRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [successFlashId, setSuccessFlashId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!goalId) {
      setLoading(false)
      setError('Missing goal id')
      return
    }

    setLoading(true)
    setError(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoading(false)
      setError(userError?.message ?? 'Not signed in')
      setUserId(null)
      return
    }

    setUserId(user.id)

    const [goalRes, questsRes] = await Promise.all([
      supabase
        .from('goals')
        .select('id,title,category,target_date,progress_percent')
        .eq('id', goalId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('weekly_quests')
        .select('id,goal_id,title,week_number,completed')
        .eq('goal_id', goalId)
        .eq('user_id', user.id)
        .order('week_number', { ascending: true }),
    ])

    setLoading(false)

    if (goalRes.error) {
      setGoal(null)
      setQuests([])
      setError(goalRes.error.message)
      return
    }
    if (!goalRes.data) {
      setGoal(null)
      setQuests([])
      setError('Goal not found')
      return
    }

    setGoal(goalRes.data as GoalRow)

    if (questsRes.error) {
      setQuests([])
      setError(questsRes.error.message)
      return
    }

    setQuests((questsRes.data ?? []) as WeeklyQuestRow[])
    setError(null)
  }, [goalId])

  useEffect(() => {
    void load()
  }, [load])

  const currentQuest = useMemo(() => pickCurrentWeekQuest(quests), [quests])
  const currentWeekNumber = currentQuest?.week_number ?? null
  const progressAccent = getMissionBoardAccent(goal?.category)
  const pct = clampPercent(goal?.progress_percent ?? 0)
  const { label: catLabel, emoji: catEmoji } = getGoalCategoryDisplay(
    goal?.category,
  )

  async function handleMarkQuestComplete(quest: WeeklyQuestRow) {
    if (!userId || !goalId || quest.completed || markingId) return

    setError(null)
    setMarkingId(quest.id)
    const { error: uErr } = await supabase
      .from('weekly_quests')
      .update({ completed: true })
      .eq('id', quest.id)
      .eq('user_id', userId)
      .eq('goal_id', goalId)

    if (uErr) {
      setMarkingId(null)
      setError(uErr.message)
      return
    }

    const nextQuests = quests.map((q) =>
      q.id === quest.id ? { ...q, completed: true } : q,
    )
    setQuests(nextQuests)
    const newPct = progressFromQuests(nextQuests)

    const { error: gErr } = await supabase
      .from('goals')
      .update({ progress_percent: newPct })
      .eq('id', goalId)
      .eq('user_id', userId)

    setMarkingId(null)

    if (gErr) {
      setError(gErr.message)
      return
    }

    setGoal((g) => (g ? { ...g, progress_percent: newPct } : null))
    setSuccessFlashId(quest.id)
    window.setTimeout(() => setSuccessFlashId(null), 1200)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800/60 px-2 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to="/goals"
          aria-label="Back to goals"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
      </header>

      {loading ? (
        <DetailSkeleton />
      ) : error && !goal ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800/80 bg-app-surface px-6 py-8 text-center shadow-lg ring-1 ring-zinc-800/40">
            <p className="text-lg font-bold text-white">
              Couldn&apos;t load goal
            </p>
            <p className="mt-2 text-sm text-zinc-500">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-6 w-full rounded-xl bg-white py-3.5 text-sm font-bold text-app-bg"
            >
              Retry
            </button>
            <Link
              to="/goals"
              className="mt-3 block text-sm font-semibold text-zinc-400 hover:text-white"
            >
              Back to Goals
            </Link>
          </div>
        </div>
      ) : goal ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10">
          {error ? (
            <div className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-amber-100/90">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="shrink-0 rounded-lg bg-white/10 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-white/20"
              >
                Retry
              </button>
            </div>
          ) : null}

          <section className="pt-2">
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
              {goal.title}
            </h1>
            <p className="mt-2 text-base font-medium text-zinc-500">
              <span aria-hidden>{catEmoji}</span>{' '}
              <span className="text-zinc-400">{catLabel}</span>
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-500">
              Due{' '}
              <span className="text-zinc-300">
                {formatDueDate(goal.target_date)}
              </span>
            </p>

            <div className="mt-5 flex max-w-lg items-center gap-3">
              <div
                className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: progressAccent,
                  }}
                />
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-zinc-300">
                {pct}%
              </span>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
              This Week&apos;s Quest
            </h2>
            {currentQuest ? (
              <div
                className={[
                  'mt-3 flex flex-col gap-4 rounded-2xl border border-zinc-800/80 bg-app-surface p-4 shadow-md ring-1 ring-zinc-800/40 transition-[transform,box-shadow] duration-300 sm:flex-row sm:items-center sm:justify-between',
                  currentQuest.completed ? 'opacity-60' : '',
                  successFlashId === currentQuest.id
                    ? 'scale-[1.02] shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500/50'
                    : '',
                ].join(' ')}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      'text-lg font-bold text-white',
                      currentQuest.completed ? 'line-through' : '',
                    ].join(' ')}
                  >
                    {currentQuest.title}
                  </p>
                  <p className="mt-1 text-sm font-medium text-zinc-500">
                    Week {currentQuest.week_number} of{' '}
                    {quests.length > 0 ? quests.length : 4}
                  </p>
                </div>
                <div className="shrink-0 sm:pl-2">
                  {currentQuest.completed ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-4 py-2 text-sm font-bold text-emerald-400 ring-1 ring-emerald-500/40">
                      Completed
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!!markingId}
                      onClick={() => void handleMarkQuestComplete(currentQuest)}
                      className="w-full rounded-xl px-5 py-3 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                      style={{ backgroundColor: QUEST_PURPLE }}
                    >
                      {markingId === currentQuest.id
                        ? 'Saving…'
                        : 'Mark Complete'}
                    </button>
                  )}
                </div>
              </div>
            ) : error && quests.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                Weekly quests couldn&apos;t be loaded. Tap Retry above.
              </p>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">
                No weekly quests for this goal yet.
              </p>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
              All Quests
            </h2>
            <ul className="mt-3 space-y-2">
              {quests.map((q) => {
                const isCurrentWeek = q.week_number === currentWeekNumber
                return (
                  <li
                    key={q.id}
                    className={[
                      'flex items-start gap-3 rounded-xl border bg-app-surface px-4 py-3 transition-opacity',
                      q.completed
                        ? 'border-zinc-800/60 opacity-50'
                        : 'border-zinc-800/80',
                      isCurrentWeek
                        ? 'border-[#534AB7]/45 shadow-[0_0_0_1px_rgba(83,74,183,0.2)]'
                        : '',
                    ].join(' ')}
                  >
                    <span className="mt-0.5 shrink-0 text-zinc-500">
                      {q.completed ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                          <CheckIcon className="h-4 w-4" />
                        </span>
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-zinc-600" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Week {q.week_number}
                      </p>
                      <p
                        className={[
                          'mt-0.5 text-sm font-semibold text-zinc-200',
                          q.completed ? 'line-through' : '',
                        ].join(' ')}
                      >
                        {q.title}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            {quests.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No quests listed.</p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
