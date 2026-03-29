import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getGoalCategoryDisplay } from '../constants/goalCategoryPills'
import { getMissionBoardAccent } from '../constants/missionBoardAccents'
import { generateMissions } from '../lib/generateMissions'
import {
  calculateCurrentWeekFromGoalStart,
  calculateProgressPercent,
  calculateTotalWeeks,
  weeklyQuestBatchRanges,
} from '../lib/goalProgress'
import { supabase } from '../supabase'

const QUEST_PURPLE = '#534AB7'

type GoalRow = {
  id: string
  title: string
  category: string | null
  target_date: string | null
  progress_percent: number
  status: string
  completed_at: string | null
  created_at: string
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
  const [generatingNextBatch, setGeneratingNextBatch] = useState(false)
  const [batchUnlockBanner, setBatchUnlockBanner] = useState<string | null>(
    null,
  )
  const [nextBatchError, setNextBatchError] = useState<string | null>(null)

  const batchGenInFlight = useRef(false)

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
        .select(
          'id,title,category,target_date,progress_percent,status,completed_at,created_at',
        )
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

    const raw = goalRes.data as Partial<GoalRow> & GoalRow
    setGoal({
      ...raw,
      status: raw.status ?? 'active',
      completed_at: raw.completed_at ?? null,
      created_at: raw.created_at ?? new Date().toISOString(),
    })

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

  const totalWeeks = useMemo(() => {
    if (!goal?.target_date) return Math.max(1, quests.length || 1)
    return calculateTotalWeeks(goal.target_date)
  }, [goal?.target_date, quests.length])

  const currentWeekFromStart = useMemo(() => {
    if (!goal?.created_at) return 1
    return calculateCurrentWeekFromGoalStart(goal.created_at)
  }, [goal?.created_at])

  const maxQuestWeek = useMemo(
    () =>
      quests.length > 0 ? Math.max(...quests.map((q) => q.week_number)) : 0,
    [quests],
  )

  const completedQuestCount = useMemo(
    () => quests.filter((q) => q.completed).length,
    [quests],
  )

  const pct = useMemo(() => {
    if (!goal) return 0
    if (!goal.target_date && quests.length === 0) {
      return clampPercent(goal.progress_percent)
    }
    const tw =
      goal.target_date != null && goal.target_date !== ''
        ? calculateTotalWeeks(goal.target_date)
        : Math.max(1, quests.length)
    return calculateProgressPercent(completedQuestCount, tw)
  }, [goal, quests.length, completedQuestCount])

  const isGoalComplete =
    goal?.status === 'completed' ||
    (totalWeeks > 0 && completedQuestCount >= totalWeeks)

  const currentQuest = useMemo(() => {
    if (quests.length === 0) return null
    const byCalendar = quests.find(
      (q) => q.week_number === currentWeekFromStart,
    )
    if (byCalendar) return byCalendar
    return pickCurrentWeekQuest(quests)
  }, [quests, currentWeekFromStart])

  const currentWeekNumber = currentQuest?.week_number ?? null
  const progressAccent = getMissionBoardAccent(goal?.category)
  const barColor = isGoalComplete ? '#22c55e' : progressAccent
  const { label: catLabel, emoji: catEmoji } = getGoalCategoryDisplay(
    goal?.category,
  )

  const batchDisplayRanges = useMemo(() => {
    const span = Math.max(totalWeeks, maxQuestWeek, 1)
    return weeklyQuestBatchRanges(span)
  }, [totalWeeks, maxQuestWeek])

  useEffect(() => {
    if (loading || !goal || !userId || !goalId) return
    if (goal.status === 'completed') return
    if (!goal.target_date || !goal.created_at) return
    if (batchGenInFlight.current) return

    const totalW = calculateTotalWeeks(goal.target_date)
    const currentW = calculateCurrentWeekFromGoalStart(goal.created_at)
    const maxExisting =
      quests.length > 0 ? Math.max(...quests.map((q) => q.week_number)) : 0

    if (maxExisting === 0) return
    if (maxExisting >= totalW) return
    if (currentW < maxExisting) return

    batchGenInFlight.current = true
    setGeneratingNextBatch(true)
    setNextBatchError(null)

    const run = async () => {
      try {
        const { data: fresh } = await supabase
          .from('weekly_quests')
          .select('week_number')
          .eq('goal_id', goalId)
          .eq('user_id', userId)
          .order('week_number', { ascending: false })
          .limit(1)

        const maxNow = fresh?.[0]?.week_number ?? 0
        const totalNow = calculateTotalWeeks(goal.target_date!)
        const currentNow = calculateCurrentWeekFromGoalStart(goal.created_at)

        if (maxNow >= totalNow || currentNow < maxNow) {
          return
        }

        const batchStart = maxNow + 1
        const batchEnd = Math.min(maxNow + 4, totalNow)

        const { data: profile } = await supabase
          .from('users')
          .select('goal_context')
          .eq('id', userId)
          .maybeSingle()

        let userContext: Record<string, unknown> | undefined
        const cat = goal.category ?? 'health_habits'
        const rawCtx = profile?.goal_context
        if (
          rawCtx &&
          typeof rawCtx === 'object' &&
          !Array.isArray(rawCtx) &&
          cat in (rawCtx as object)
        ) {
          const slice = (rawCtx as Record<string, unknown>)[cat]
          if (
            slice &&
            typeof slice === 'object' &&
            !Array.isArray(slice) &&
            Object.values(slice as Record<string, unknown>).some(
              (v) => typeof v === 'string' && v.trim().length > 0,
            )
          ) {
            userContext = slice as Record<string, unknown>
          }
        }

        const missions = await generateMissions(
          goal.title,
          cat,
          goal.target_date!,
          userContext,
          batchStart,
          batchEnd,
          totalNow,
        )

        const rows = missions.weekly_quests.map((title, i) => ({
          goal_id: goalId,
          user_id: userId,
          title,
          week_number: batchStart + i,
          completed: false,
          xp_reward: 150,
        }))

        const { error: insErr } = await supabase
          .from('weekly_quests')
          .insert(rows)

        if (insErr) {
          setNextBatchError(insErr.message)
          return
        }

        setBatchUnlockBanner(
          `New quests unlocked for weeks ${batchStart}–${batchEnd}!`,
        )
        window.setTimeout(() => setBatchUnlockBanner(null), 6500)
        await load()
      } catch (e) {
        setNextBatchError(
          e instanceof Error ? e.message : 'Could not load next quests',
        )
      } finally {
        batchGenInFlight.current = false
        setGeneratingNextBatch(false)
      }
    }

    void run()
  }, [loading, goal, quests, userId, goalId, load])

  async function handleMarkQuestComplete(quest: WeeklyQuestRow) {
    if (
      !userId ||
      !goalId ||
      !goal ||
      quest.completed ||
      markingId ||
      goal.status === 'completed'
    ) {
      return
    }

    const prevQuests = quests
    const prevGoal = goal

    const nextQuests = quests.map((q) =>
      q.id === quest.id ? { ...q, completed: true } : q,
    )
    const doneCount = nextQuests.filter((q) => q.completed).length
    const totalW =
      goal.target_date != null && goal.target_date !== ''
        ? calculateTotalWeeks(goal.target_date)
        : Math.max(1, nextQuests.length)
    const newPct = calculateProgressPercent(doneCount, totalW)
    const reached100 = doneCount >= totalW && totalW > 0
    const completedAtIso = reached100 ? new Date().toISOString() : null

    setError(null)
    setMarkingId(quest.id)

    setQuests(nextQuests)
    setGoal((g) =>
      g
        ? {
            ...g,
            progress_percent: newPct,
            status: reached100 ? 'completed' : g.status,
            completed_at: reached100 ? completedAtIso : g.completed_at,
          }
        : null,
    )

    const { error: uErr } = await supabase
      .from('weekly_quests')
      .update({ completed: true })
      .eq('id', quest.id)
      .eq('user_id', userId)
      .eq('goal_id', goalId)

    if (uErr) {
      setQuests(prevQuests)
      setGoal(prevGoal)
      setMarkingId(null)
      setError(uErr.message)
      return
    }

    const goalUpdate: {
      progress_percent: number
      status?: string
      completed_at?: string | null
    } = { progress_percent: newPct }

    if (reached100) {
      goalUpdate.status = 'completed'
      goalUpdate.completed_at = completedAtIso
    }

    const { error: gErr } = await supabase
      .from('goals')
      .update(goalUpdate)
      .eq('id', goalId)
      .eq('user_id', userId)

    if (gErr) {
      const { error: revErr } = await supabase
        .from('weekly_quests')
        .update({ completed: false })
        .eq('id', quest.id)
        .eq('user_id', userId)
        .eq('goal_id', goalId)
      setQuests(prevQuests)
      setGoal(prevGoal)
      setMarkingId(null)
      setError(
        revErr
          ? `${gErr.message} (quest unlock failed: ${revErr.message})`
          : gErr.message,
      )
      return
    }

    setMarkingId(null)
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

          {batchUnlockBanner ? (
            <div
              className="mb-4 rounded-xl border border-app-accent/35 bg-app-accent/15 px-4 py-3 text-center text-sm font-semibold text-zinc-100 ring-1 ring-app-accent/25"
              role="status"
            >
              {batchUnlockBanner}
            </div>
          ) : null}

          {nextBatchError ? (
            <p className="mb-3 text-center text-xs font-medium text-amber-400/90">
              {nextBatchError}
            </p>
          ) : null}

          <section className="pt-2">
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
              {goal.title}
            </h1>
            <p className="mt-2 text-base font-medium text-zinc-500">
              <span aria-hidden>{catEmoji}</span>{' '}
              <span className="text-zinc-400">{catLabel}</span>
            </p>
            <p className="mt-2 text-sm font-semibold text-zinc-400">
              Week {currentWeekFromStart} of {totalWeeks}
            </p>
            <p className="mt-2 text-sm font-semibold text-zinc-500">
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
                    backgroundColor: barColor,
                  }}
                />
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-zinc-300">
                {pct}%
              </span>
            </div>
            {isGoalComplete ? (
              <div
                className="mt-4 max-w-lg rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-center text-sm font-bold text-emerald-200 ring-1 ring-emerald-500/30"
                role="status"
              >
                Goal Complete!
              </div>
            ) : null}
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
                    Week {currentQuest.week_number} of {totalWeeks}
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                All Quests
              </h2>
              {generatingNextBatch ? (
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500"
                  aria-live="polite"
                >
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                  Generating…
                </span>
              ) : null}
            </div>

            {batchDisplayRanges.map((range) => {
              const inBatch = quests.filter(
                (q) =>
                  q.week_number >= range.start && q.week_number <= range.end,
              )
              if (inBatch.length === 0) return null
              return (
                <div key={`${range.start}-${range.end}`} className="mt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                    Weeks {range.start}–{range.end}
                  </p>
                  <ul className="space-y-2">
                    {inBatch.map((q) => {
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
                </div>
              )
            })}

            {quests.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No quests listed.</p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
