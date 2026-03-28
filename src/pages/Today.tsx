import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMissionBoardAccent } from '../constants/missionBoardAccents'
import { supabase } from '../supabase'

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTodayHeading(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

type GoalEmbed = { title: string; category: string | null }

type MissionRow = {
  id: string
  title: string
  completed: boolean
  completed_at: string | null
  goal_id: string
  goals: GoalEmbed | GoalEmbed[] | null
}

function pickGoalEmbed(
  goals: GoalEmbed | GoalEmbed[] | null | undefined,
): GoalEmbed | null {
  if (!goals) return null
  if (Array.isArray(goals)) return goals[0] ?? null
  return goals
}

type TodayMission = {
  id: string
  title: string
  completed: boolean
  completed_at: string | null
  goal_id: string
  goalTitle: string
  category: string | null
}

function mapRowToMission(row: MissionRow): TodayMission {
  const g = pickGoalEmbed(row.goals)
  return {
    id: row.id,
    title: row.title,
    completed: row.completed,
    completed_at: row.completed_at,
    goal_id: row.goal_id,
    goalTitle: g?.title ?? 'Goal',
    category: g?.category ?? null,
  }
}

function MissionSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-800/40 p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-[85%] max-w-xs rounded-lg bg-zinc-700/80" />
          <div className="h-3.5 w-2/5 max-w-[10rem] rounded bg-zinc-700/60" />
        </div>
        <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-700/80" />
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg
      className="h-5 w-5 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

export function Today() {
  const todayStr = useMemo(() => formatLocalDate(new Date()), [])
  const headingDate = useMemo(() => formatTodayHeading(new Date()), [])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hasGoals, setHasGoals] = useState(false)
  const [missions, setMissions] = useState<TodayMission[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoading(false)
      setLoadError(userError?.message ?? 'Not signed in')
      setUserId(null)
      return
    }

    setUserId(user.id)

    const [goalsRes, missionsRes] = await Promise.all([
      supabase
        .from('goals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'active'),
      supabase
        .from('daily_missions')
        .select(
          `
          id,
          title,
          completed,
          completed_at,
          goal_id,
          goals ( title, category )
        `,
        )
        .eq('user_id', user.id)
        .eq('due_date', todayStr)
        .order('created_at', { ascending: true }),
    ])

    setLoading(false)

    if (goalsRes.error) {
      setLoadError(goalsRes.error.message)
      return
    }
    if (missionsRes.error) {
      setLoadError(missionsRes.error.message)
      return
    }

    const count = goalsRes.count ?? 0
    setHasGoals(count > 0)

    const rows = (missionsRes.data ?? []) as unknown as MissionRow[]
    const list = rows.map(mapRowToMission)
    setMissions(list)
    setShowCelebration(
      list.length > 0 && list.every((m) => m.completed),
    )
  }, [todayStr])

  useEffect(() => {
    void load()
  }, [load])

  const doneCount = missions.filter((m) => m.completed).length
  const total = missions.length
  const allDone = total > 0 && doneCount === total

  async function handleCompleteMission(missionId: string) {
    if (!userId) return
    const target = missions.find((m) => m.id === missionId)
    if (!target || target.completed) return

    setCompleteError(null)
    const snapshot = missions
    const nowIso = new Date().toISOString()
    const optimistic = missions.map((m) =>
      m.id === missionId
        ? { ...m, completed: true, completed_at: nowIso }
        : m,
    )
    setMissions(optimistic)

    const allCompleteNow =
      optimistic.length > 0 && optimistic.every((m) => m.completed)
    if (allCompleteNow) setShowCelebration(true)

    const { error } = await supabase
      .from('daily_missions')
      .update({
        completed: true,
        completed_at: nowIso,
      })
      .eq('id', missionId)
      .eq('user_id', userId)

    if (error) {
      setMissions(snapshot)
      setShowCelebration(
        snapshot.length > 0 && snapshot.every((m) => m.completed),
      )
      setCompleteError(error.message)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      {showCelebration && total > 0 ? (
        <div
          className="shrink-0 bg-emerald-500/20 px-4 py-3 text-center text-sm font-bold leading-snug text-emerald-300 ring-1 ring-emerald-500/35"
          role="status"
        >
          All missions complete! Full clear bonus incoming.
        </div>
      ) : null}

      <header className="shrink-0 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {headingDate}
        </h1>
        {loading ? (
          <div className="mt-2 h-4 w-40 animate-pulse rounded bg-zinc-800" />
        ) : loadError ? null : total > 0 ? (
          allDone ? (
            <p className="mt-1 text-sm font-semibold text-emerald-400">
              All done today!
            </p>
          ) : (
            <p className="mt-1 text-sm font-medium text-zinc-500">
              {doneCount} / {total} missions done today
            </p>
          )
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        {loadError ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="max-w-md text-center text-sm font-medium text-red-400">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-app-bg"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="mx-auto flex max-w-lg flex-col gap-3">
            <MissionSkeleton />
            <MissionSkeleton />
            <MissionSkeleton />
          </div>
        ) : !hasGoals ? (
          <div className="mx-auto flex max-w-md flex-col items-center px-2 py-16 text-center">
            <p className="text-sm font-medium leading-relaxed text-zinc-400">
              No goals yet — head to Goals to create your first one
            </p>
            <Link
              to="/goals"
              className="mt-6 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-app-bg shadow-lg shadow-black/20 transition-opacity active:opacity-90"
            >
              Go to Goals
            </Link>
          </div>
        ) : missions.length === 0 ? (
          <div className="mx-auto max-w-md px-2 py-16 text-center">
            <p className="text-sm font-medium text-zinc-400">
              No missions today — check back tomorrow
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-lg flex-col gap-3">
            {completeError ? (
              <p className="text-center text-sm font-medium text-red-400">
                {completeError}
              </p>
            ) : null}
            {missions.map((m) => {
              const accent = getMissionBoardAccent(m.category)
              return (
                <div
                  key={m.id}
                  className={[
                    'flex items-stretch gap-3 rounded-2xl border border-zinc-800/80 bg-app-surface p-4 shadow-sm transition-opacity',
                    m.completed ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  <div
                    className="w-1 shrink-0 self-stretch rounded-full"
                    style={{ backgroundColor: accent }}
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className={[
                          'text-base font-bold leading-snug text-white',
                          m.completed ? 'line-through' : '',
                        ].join(' ')}
                      >
                        {m.title}
                      </p>
                      <p className="mt-1 truncate text-sm font-medium text-zinc-500">
                        {m.goalTitle}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={m.completed}
                      onClick={() => void handleCompleteMission(m.id)}
                      aria-label={
                        m.completed
                          ? 'Completed'
                          : `Mark complete: ${m.title}`
                      }
                      className={[
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-transform active:scale-95',
                        m.completed
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-zinc-500 bg-transparent hover:border-zinc-400',
                        m.completed ? '' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      {m.completed ? <CheckIcon /> : null}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
