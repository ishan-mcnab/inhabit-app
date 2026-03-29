import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMissionBoardAccent } from '../constants/missionBoardAccents'
import { runFullClearConfetti } from '../lib/fullClearConfetti'
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

const SKELETON_STRIPE = '#52525b'

function MissionSkeleton() {
  return (
    <div className="mission-skeleton-shell flex min-h-[92px] items-stretch gap-3 rounded-2xl border border-zinc-800/80 p-4 shadow-sm">
      <div
        className="w-1 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: SKELETON_STRIPE }}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="h-5 w-[88%] max-w-sm rounded-md bg-black/22" />
          <div className="h-3.5 w-[42%] max-w-[9rem] rounded-md bg-black/22" />
        </div>
        <div className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 rounded-full border border-zinc-700/50 bg-black/15" />
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

function StateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-800/80 bg-app-surface px-6 py-9 text-center shadow-lg shadow-black/25 ring-1 ring-zinc-800/40 transition-opacity duration-300">
      {children}
    </div>
  )
}

function revealBanner(
  setOpen: (v: boolean) => void,
  setExpanded: (v: boolean) => void,
) {
  setOpen(true)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => setExpanded(true))
  })
}

export function Today() {
  const todayStr = useMemo(() => formatLocalDate(new Date()), [])
  const headingDate = useMemo(() => formatTodayHeading(new Date()), [])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hasGoals, setHasGoals] = useState(false)
  const [missions, setMissions] = useState<TodayMission[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [celebrationBannerOpen, setCelebrationBannerOpen] = useState(false)
  const [celebrationBannerExpanded, setCelebrationBannerExpanded] =
    useState(false)
  const [pressingMissionId, setPressingMissionId] = useState<string | null>(
    null,
  )

  const deferBannerForConfettiRef = useRef(false)
  const confettiCancelRef = useRef<(() => void) | null>(null)

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
  }, [todayStr])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (loading || loadError) return
    if (missions.length === 0 || !missions.every((m) => m.completed)) {
      setCelebrationBannerExpanded(false)
      const collapseTimer = window.setTimeout(() => {
        setCelebrationBannerOpen(false)
      }, 520)
      return () => window.clearTimeout(collapseTimer)
    }
    if (deferBannerForConfettiRef.current) return
    revealBanner(setCelebrationBannerOpen, setCelebrationBannerExpanded)
  }, [loading, loadError, missions])

  const doneCount = missions.filter((m) => m.completed).length
  const total = missions.length
  const allDone = total > 0 && doneCount === total

  async function handleCompleteMission(missionId: string) {
    if (!userId) return
    const target = missions.find((m) => m.id === missionId)
    if (!target || target.completed) return

    setCompleteError(null)
    const snapshot = missions
    const wasAllComplete = snapshot.every((m) => m.completed)
    const nowIso = new Date().toISOString()
    const optimistic = missions.map((m) =>
      m.id === missionId
        ? { ...m, completed: true, completed_at: nowIso }
        : m,
    )
    const allCompleteNow =
      optimistic.length > 0 && optimistic.every((m) => m.completed)

    if (allCompleteNow && !wasAllComplete) {
      deferBannerForConfettiRef.current = true
      setCelebrationBannerExpanded(false)
      setCelebrationBannerOpen(false)
      confettiCancelRef.current?.()
      confettiCancelRef.current = runFullClearConfetti(() => {
        confettiCancelRef.current = null
        deferBannerForConfettiRef.current = false
        revealBanner(setCelebrationBannerOpen, setCelebrationBannerExpanded)
      })
    }

    setMissions(optimistic)

    const { error } = await supabase
      .from('daily_missions')
      .update({
        completed: true,
        completed_at: nowIso,
      })
      .eq('id', missionId)
      .eq('user_id', userId)

    if (error) {
      confettiCancelRef.current?.()
      confettiCancelRef.current = null
      deferBannerForConfettiRef.current = false
      setMissions(snapshot)
      setCelebrationBannerExpanded(
        snapshot.length > 0 && snapshot.every((m) => m.completed),
      )
      setCelebrationBannerOpen(
        snapshot.length > 0 && snapshot.every((m) => m.completed),
      )
      setCompleteError(error.message)
      return
    }

    void load()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <div
        className={[
          'grid shrink-0 transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
          celebrationBannerOpen && celebrationBannerExpanded
            ? 'grid-rows-[1fr]'
            : 'grid-rows-[0fr]',
        ].join(' ')}
      >
        <div className="min-h-0 overflow-hidden">
          {celebrationBannerOpen ? (
            <div
              className="bg-emerald-500/20 px-4 py-3 text-center text-sm font-bold leading-snug text-emerald-300 ring-1 ring-emerald-500/35"
              role="status"
            >
              All missions complete! Full clear bonus incoming.
            </div>
          ) : null}
        </div>
      </div>

      <header className="shrink-0 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-300">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {headingDate}
        </h1>
        {loading ? (
          <div className="mt-2 h-4 w-40 rounded bg-[#1e1e22] mission-skeleton-shell" />
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
          <div className="flex min-h-[50vh] flex-col items-center justify-center px-2 py-8">
            <StateCard>
              <p className="text-lg font-bold text-white">
                Couldn&apos;t load missions
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                {loadError}
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-6 w-full rounded-xl bg-white py-3.5 text-sm font-bold text-app-bg transition-opacity active:opacity-90"
              >
                Try again
              </button>
            </StateCard>
          </div>
        ) : loading ? (
          <div className="mx-auto flex max-w-lg flex-col gap-0">
            <MissionSkeleton />
            <div
              className="my-3 h-px shrink-0 bg-zinc-800/60"
              aria-hidden
            />
            <MissionSkeleton />
            <div
              className="my-3 h-px shrink-0 bg-zinc-800/60"
              aria-hidden
            />
            <MissionSkeleton />
          </div>
        ) : !hasGoals ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center px-2 py-8">
            <StateCard>
              <p className="text-lg font-bold text-white">No goals yet</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                Create your first goal to get daily missions
              </p>
              <Link
                to="/goals/new"
                className="mt-6 block w-full rounded-xl py-3.5 text-center text-sm font-bold text-white transition-opacity active:opacity-90"
                style={{ backgroundColor: '#534AB7' }}
              >
                Create a Goal
              </Link>
            </StateCard>
          </div>
        ) : missions.length === 0 ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center px-2 py-8">
            <StateCard>
              <p className="text-lg font-bold text-white">No missions today</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                Check back tomorrow or create a new goal
              </p>
              <Link
                to="/goals"
                className="mt-6 block w-full rounded-xl border border-zinc-700 bg-zinc-800/50 py-3.5 text-center text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Go to Goals
              </Link>
            </StateCard>
          </div>
        ) : (
          <div className="mx-auto flex max-w-lg flex-col">
            {completeError ? (
              <p className="mb-3 text-center text-sm font-medium text-red-400 transition-opacity">
                {completeError}
              </p>
            ) : null}
            {missions.map((m, index) => {
              const accent = getMissionBoardAccent(m.category)
              const isPressing = pressingMissionId === m.id
              return (
                <div key={m.id}>
                  {index > 0 ? (
                    <div
                      className="my-3 h-px bg-zinc-800/60"
                      aria-hidden
                    />
                  ) : null}
                  <div
                    className={[
                      'flex transform-gpu items-stretch gap-3 rounded-2xl border border-zinc-800/80 bg-app-surface p-4 shadow-sm will-change-transform',
                      m.completed ? 'opacity-50' : 'opacity-100',
                      isPressing
                        ? 'scale-[0.97] transition-none'
                        : 'scale-100 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                    ].join(' ')}
                    onPointerDownCapture={(e) => {
                      if (m.completed) return
                      const el = e.target
                      if (!(el instanceof Element)) return
                      if (!el.closest('[data-mission-checkbox]')) return
                      setPressingMissionId(m.id)
                      window.setTimeout(() => {
                        setPressingMissionId((prev) =>
                          prev === m.id ? null : prev,
                        )
                      }, 100)
                    }}
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
                        data-mission-checkbox
                        disabled={m.completed}
                        onClick={() => {
                          requestAnimationFrame(() => {
                            void handleCompleteMission(m.id)
                          })
                        }}
                        aria-label={
                          m.completed
                            ? 'Completed'
                            : `Mark complete: ${m.title}`
                        }
                        className={[
                          'flex min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-full border-2',
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
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
