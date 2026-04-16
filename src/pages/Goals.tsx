import { useCallback, useEffect, useRef, useState } from 'react'
import { Flag, Plus, Sparkles } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useNotifications } from '../context/NotificationContext'
import {
  GOAL_PURPLE,
  getCategoryBorderColor,
  getGoalCategoryDisplay,
} from '../constants/goalCategoryPills'
import {
  calculateCurrentWeekFromGoalStart,
  calculateTotalWeeks,
} from '../lib/goalProgress'
import { localWeekMondaySundayYmd } from '../lib/isoWeek'
import { suggestGoals, type SuggestedGoal } from '../lib/suggestGoals'
import {
  pickActiveQuest,
  type PickableQuest,
  type QuestProgressionMode,
} from '../lib/weeklyQuestPick'
import { SectionLoadErrorCard } from '../components/SectionLoadErrorCard'
import { appCache, goalsCacheKey, habitsCacheKey } from '../lib/cache'
import { supabase } from '../supabase'

type GoalRow = {
  id: string
  title: string
  category: string | null
  target_date: string | null
  progress_percent: number
  status?: string
  created_at?: string
}

type CompletedGoalRow = {
  id: string
  title: string
  category: string | null
  target_date: string | null
  progress_percent: number
  completed_at: string | null
}

const LEGACY_TRAINING_LOG_TITLE = "📝 Log today's training"

const FITNESS_QUICK_HABITS = [
  { title: '🏋️ Hit the gym' },
  { title: '🥗 Hit protein target' },
  { title: "📓 Record today's session" },
] as const

function fitnessQuickHabitAlreadyAdded(
  title: string,
  habitTitles: Set<string>,
): boolean {
  if (habitTitles.has(title)) return true
  if (
    title === "📓 Record today's session" &&
    habitTitles.has(LEGACY_TRAINING_LOG_TITLE)
  ) {
    return true
  }
  return false
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

const CARD_SURFACE = '#141418'
const CARD_BORDER = 'rgba(255,255,255,0.08)'
const MUTED_BODY = '#888780'
const PAUSED_AMBER = '#BA7517'

const TAB_REFRESH_STALE_MS = 30_000
const SKELETON_DELAY_MS = 200

type GoalsCachePayload = {
  goals: GoalRow[]
  pausedGoals: GoalRow[]
  completedGoals: CompletedGoalRow[]
  questPreviewByGoalId: Record<string, string>
  fitnessTitles: string[]
  goalsNeedingAttention: number
  hasFitnessCategory: boolean
}

function localDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysUntilTarget(isoDate: string | null): number | null {
  if (!isoDate) return null
  const parts = isoDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  const [y, m, d] = parts
  const target = localDayStart(new Date(y, m - 1, d))
  const today = localDayStart(new Date())
  return Math.ceil(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  )
}

function targetDateClass(isoDate: string | null): string {
  const days = daysUntilTarget(isoDate)
  if (days == null) return 'text-[#888780]'
  if (days <= 14) return 'text-red-400'
  if (days <= 30) return 'text-amber-400'
  return 'text-[#888780]'
}

function formatCompletedAt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function Goals() {
  const { setGoalsNeedingAttention } = useNotifications()
  const navigate = useNavigate()
  const location = useLocation()
  const [goals, setGoals] = useState<GoalRow[]>([])
  const [pausedGoals, setPausedGoals] = useState<GoalRow[]>([])
  const [completedGoals, setCompletedGoals] = useState<CompletedGoalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadStallMessage, setLoadStallMessage] = useState<string | null>(null)
  const [completedGoalsError, setCompletedGoalsError] = useState<string | null>(
    null,
  )
  const [toast, setToast] = useState<string | null>(null)
  const [fitnessHabitTitles, setFitnessHabitTitles] = useState<Set<string>>(
    () => new Set(),
  )
  const [addingHabitKey, setAddingHabitKey] = useState<string | null>(null)
  const [fitnessInfoOpen, setFitnessInfoOpen] = useState(false)
  const [hasFitnessCategory, setHasFitnessCategory] = useState(false)

  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestPhase, setSuggestPhase] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestedGoal[]>([])
  const [questPreviewByGoalId, setQuestPreviewByGoalId] = useState<
    Record<string, string>
  >({})

  const loadGenRef = useRef(0)
  const lastFetchedAtRef = useRef<number | null>(null)
  const skeletonDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const [showDelayedSkeleton, setShowDelayedSkeleton] = useState(false)

  const clearSkeletonDelayTimer = useCallback(() => {
    if (skeletonDelayTimerRef.current !== null) {
      window.clearTimeout(skeletonDelayTimerRef.current)
      skeletonDelayTimerRef.current = null
    }
  }, [])

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = Boolean(opts?.silent)
      const gen = ++loadGenRef.current

      if (!silent) {
        setError(null)
        setLoadStallMessage(null)
        setCompletedGoalsError(null)
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        if (loadGenRef.current !== gen) return
        if (!silent) {
          clearSkeletonDelayTimer()
          setShowDelayedSkeleton(false)
          setLoading(false)
          setGoalsNeedingAttention(0)
          setError(userError?.message ?? 'Not signed in')
        }
        return
      }

      if (!silent) {
        const cached = appCache.get<GoalsCachePayload>(goalsCacheKey(user.id))
        if (cached) {
          setGoals(cached.goals)
          setPausedGoals(cached.pausedGoals ?? [])
          setCompletedGoals(cached.completedGoals)
          setQuestPreviewByGoalId(cached.questPreviewByGoalId)
          setFitnessHabitTitles(new Set(cached.fitnessTitles))
          setHasFitnessCategory(Boolean(cached.hasFitnessCategory))
          setGoalsNeedingAttention(cached.goalsNeedingAttention)
          setLoading(false)
          setShowDelayedSkeleton(false)
        } else {
          setLoading(true)
          clearSkeletonDelayTimer()
          skeletonDelayTimerRef.current = window.setTimeout(() => {
            if (loadGenRef.current !== gen) return
            setShowDelayedSkeleton(true)
          }, SKELETON_DELAY_MS)
        }
      }

      const [activeRes, pausedRes, completedRes, habitsRes, prefsRes] =
        await Promise.all([
      supabase
        .from('goals')
        .select(
          'id,title,category,target_date,progress_percent,status,created_at',
        )
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('goals')
        .select(
          'id,title,category,target_date,progress_percent,status,created_at',
        )
        .eq('user_id', user.id)
        .eq('status', 'paused')
        .order('created_at', { ascending: false }),
      supabase
        .from('goals')
        .select(
          'id,title,category,target_date,progress_percent,status,completed_at',
        )
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false, nullsFirst: false }),
      supabase
        .from('habits')
        .select('title')
        .eq('user_id', user.id)
        .eq('category', 'fitness_consistency'),
      supabase
        .from('users')
        .select('quest_progression, goal_categories')
        .eq('id', user.id)
        .maybeSingle(),
    ])

    if (activeRes.error) {
      if (loadGenRef.current !== gen) return
      setError(activeRes.error.message)
      setGoals([])
      setPausedGoals([])
      setCompletedGoals([])
      setQuestPreviewByGoalId({})
      setGoalsNeedingAttention(0)
      setHasFitnessCategory(false)
      clearSkeletonDelayTimer()
      setShowDelayedSkeleton(false)
      if (!silent) setLoading(false)
      return
    }

    const goalsList = (activeRes.data ?? []) as GoalRow[]
    if (loadGenRef.current !== gen) return
    setGoals(goalsList)

    const pausedList = pausedRes.error
      ? []
      : ((pausedRes.data ?? []) as GoalRow[])
    if (pausedRes.error) {
      console.error('Goals: paused goals fetch failed:', pausedRes.error)
    }
    setPausedGoals(pausedList)

    const goalIds = goalsList.map((g) => g.id)

    const questMode: QuestProgressionMode =
      prefsRes.data?.quest_progression === 'completion'
        ? 'completion'
        : 'weekly'

    const rawCats = prefsRes.data?.goal_categories
    const hasFitness =
      Array.isArray(rawCats) && rawCats.includes('fitness_consistency')
    setHasFitnessCategory(hasFitness)

    const nextPreviews: Record<string, string> = {}
    let attentionCount = 0

    if (goalIds.length > 0) {
      const { mon, sun } = localWeekMondaySundayYmd(new Date())
      const [dmRes, wqRes] = await Promise.all([
        supabase
          .from('daily_missions')
          .select('goal_id')
          .eq('user_id', user.id)
          .in('goal_id', goalIds)
          .gte('due_date', mon)
          .lte('due_date', sun),
        supabase
          .from('weekly_quests')
          .select('id,goal_id,title,week_number,completed')
          .eq('user_id', user.id)
          .in('goal_id', goalIds),
      ])

      if (dmRes.error) {
        console.error('Goals: weekly missions check failed:', dmRes.error)
        attentionCount = 0
      } else {
        const withMissions = new Set(
          (dmRes.data ?? [])
            .map((r) => (typeof r.goal_id === 'string' ? r.goal_id : ''))
            .filter(Boolean),
        )
        attentionCount = goalsList.filter((g) => !withMissions.has(g.id)).length
      }
      setGoalsNeedingAttention(attentionCount)

      if (!wqRes.error && wqRes.data) {
        const byGoal: Record<string, PickableQuest[]> = {}
        for (const r of wqRes.data) {
          const gid = String(r.goal_id ?? '')
          if (!gid) continue
          if (!byGoal[gid]) byGoal[gid] = []
          byGoal[gid].push({
            id: String(r.id ?? ''),
            week_number:
              typeof r.week_number === 'number' && !Number.isNaN(r.week_number)
                ? r.week_number
                : 0,
            completed: Boolean(r.completed),
            title: typeof r.title === 'string' ? r.title : '',
          })
        }
        for (const g of goalsList) {
          const list = byGoal[g.id] ?? []
          const currentW = g.created_at
            ? calculateCurrentWeekFromGoalStart(g.created_at)
            : 1
          const active = pickActiveQuest(list, currentW, questMode)
          if (active && !active.completed) {
            nextPreviews[g.id] = active.title
          }
        }
      }
    } else {
      setGoalsNeedingAttention(0)
    }

    if (loadGenRef.current !== gen) return
    setQuestPreviewByGoalId(nextPreviews)

    let completedRows: CompletedGoalRow[] = []
    if (completedRes.error) {
      setCompletedGoalsError(completedRes.error.message)
      setCompletedGoals([])
    } else {
      completedRows = (completedRes.data ?? []) as CompletedGoalRow[]
      setCompletedGoals(completedRows)
    }

    const titles = new Set<string>()
    for (const row of habitsRes.data ?? []) {
      if (row.title) titles.add(row.title)
    }
    setFitnessHabitTitles(titles)

    if (habitsRes.error) {
      console.error('Goals: fitness habits check failed:', habitsRes.error)
    }

    if (loadGenRef.current !== gen) return

    appCache.set(
      goalsCacheKey(user.id),
      {
        goals: goalsList,
        pausedGoals: pausedList,
        completedGoals: completedRows,
        questPreviewByGoalId: nextPreviews,
        fitnessTitles: Array.from(titles),
        goalsNeedingAttention: attentionCount,
        hasFitnessCategory: hasFitness,
      },
      30_000,
    )

    clearSkeletonDelayTimer()
    setShowDelayedSkeleton(false)
    lastFetchedAtRef.current = Date.now()
    if (!silent) {
      setLoading(false)
    }
  }, [setGoalsNeedingAttention, clearSkeletonDelayTimer])

  const maybeRefreshGoals = useCallback(() => {
    const t = lastFetchedAtRef.current
    if (t !== null && Date.now() - t < TAB_REFRESH_STALE_MS) return
    const silent = t !== null
    void load({ silent })
  }, [load])

  useEffect(() => {
    if (location.pathname !== '/goals') return
    void maybeRefreshGoals()
  }, [location.pathname, maybeRefreshGoals])

  useEffect(() => {
    if (!loading) return
    const gen = loadGenRef.current
    const t = window.setTimeout(() => {
      if (loadGenRef.current !== gen) return
      clearSkeletonDelayTimer()
      setShowDelayedSkeleton(false)
      setLoadStallMessage(
        'Taking longer than expected. Please check your connection and try again.',
      )
      setLoading(false)
    }, 10_000)
    return () => window.clearTimeout(t)
  }, [loading, clearSkeletonDelayTimer])

  useEffect(() => {
    if (location.pathname !== '/goals') return
    const state = location.state as { toast?: string } | null
    const msg = state?.toast
    if (!msg) return
    setToast(msg)
    void navigate('/goals', { replace: true, state: {} })
    const t = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (location.pathname !== '/goals') return
      void maybeRefreshGoals()
    }
    const onWindowFocus = () => {
      if (location.pathname !== '/goals') return
      void maybeRefreshGoals()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onWindowFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onWindowFocus)
    }
  }, [maybeRefreshGoals, location.pathname])

  async function handleQuickFitnessHabit(title: string) {
    if (fitnessQuickHabitAlreadyAdded(title, fitnessHabitTitles)) return
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
      appCache.invalidate(habitsCacheKey(user.id))
      setFitnessHabitTitles((prev) => new Set(prev).add(title))
      setToast('Habit added! Find it on the Today tab.')
      window.setTimeout(() => setToast(null), 2200)
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
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold tracking-tight text-white">
            Goals
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void openSuggestions()}
            className="btn-press flex items-center gap-1.5 rounded-lg border-2 border-[#534AB7] bg-transparent px-3 py-2 text-sm font-bold text-[#534AB7] transition-colors hover:bg-white/5"
          >
            <Sparkles size={14} aria-hidden strokeWidth={2} />
            Suggest goals
          </button>
          <Link
            to="/goals/new"
            aria-label="Create new goal"
            className="btn-press flex size-9 items-center justify-center rounded-lg text-white shadow-md transition-colors hover:opacity-90"
            style={{ backgroundColor: GOAL_PURPLE }}
          >
            <Plus size={18} aria-hidden strokeWidth={2.5} />
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-28 pt-4">
        {toast ? (
          <div className="mx-auto mb-4 max-w-lg rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-center text-sm font-semibold text-emerald-200 ring-1 ring-emerald-500/25">
            {toast}
          </div>
        ) : null}
        {loading && showDelayedSkeleton ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16">
            <p className="text-sm font-medium text-zinc-500">Loading goals…</p>
          </div>
        ) : error || loadStallMessage ? (
          <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-12 px-2">
            <SectionLoadErrorCard
              sectionLabel="goals"
              message={loadStallMessage ?? error ?? 'Unknown error'}
              onRetry={() => {
                setLoadStallMessage(null)
                void load({ silent: false })
              }}
            />
          </div>
        ) : loading ? null : (
          <>
            {goals.length === 0 ? (
              completedGoals.length === 0 && pausedGoals.length === 0 ? (
                <div className="flex min-h-[min(60vh,28rem)] flex-1 flex-col items-center justify-center px-4 py-12 text-center">
                  <Flag
                    size={40}
                    strokeWidth={1.5}
                    className="shrink-0 text-[#444441]"
                    aria-hidden
                  />
                  <p className="mt-5 text-base font-bold text-white">
                    No goals yet
                  </p>
                  <p
                    className="mt-2 max-w-[260px] text-[13px] font-medium leading-snug"
                    style={{ color: MUTED_BODY }}
                  >
                    Set a goal and InHabit will build your daily plan.
                  </p>
                  <Link
                    to="/goals/new"
                    className="btn-press mt-8 w-full max-w-[280px] rounded-xl py-3.5 text-center text-sm font-bold text-white transition-opacity hover:opacity-95"
                    style={{ backgroundColor: GOAL_PURPLE }}
                  >
                    Set your first goal →
                  </Link>
                </div>
              ) : (
                <p className="mx-auto max-w-lg px-1 pb-2 text-center text-sm font-medium text-zinc-500">
                  No active goals
                </p>
              )
            ) : (
              <ul className="mx-auto flex max-w-lg flex-col gap-2.5">
                {goals.map((goal) => {
                  const { label, emoji } = getGoalCategoryDisplay(goal.category)
                  const accent = getCategoryBorderColor(goal.category)
                  const pct = clampPercent(goal.progress_percent)
                  const totalW = goal.target_date
                    ? calculateTotalWeeks(goal.target_date)
                    : 1
                  const currentW = goal.created_at
                    ? calculateCurrentWeekFromGoalStart(goal.created_at)
                    : 1
                  const targetCls = targetDateClass(goal.target_date)
                  return (
                    <li key={goal.id}>
                      <Link
                        to={`/goals/${goal.id}`}
                        className="block rounded-2xl outline-none ring-app-accent/0 transition-transform focus-visible:ring-2 focus-visible:ring-app-accent/50 active:scale-[0.98]"
                      >
                        <article
                          className="card-interactive flex min-h-[90px] gap-3 rounded-2xl border p-4 shadow-sm transition-colors hover:bg-white/[0.04]"
                          style={{
                            backgroundColor: CARD_SURFACE,
                            borderColor: CARD_BORDER,
                          }}
                        >
                          <div
                            className="w-[3px] shrink-0 self-stretch rounded-full"
                            style={{ backgroundColor: accent }}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <h2 className="text-[15px] font-semibold leading-snug text-white">
                              {goal.title}
                            </h2>
                            <p
                              className="mt-2 text-xs font-medium"
                              style={{ color: MUTED_BODY }}
                            >
                              <span aria-hidden>{emoji}</span> {label}
                            </p>
                            <p className={`mt-1 text-xs font-medium ${targetCls}`}>
                              Target {formatTargetDate(goal.target_date)}
                            </p>
                            <div className="mt-4">
                              <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
                                <span>Progress</span>
                                <span className="tabular-nums text-app-accent">
                                  {pct}%
                                </span>
                              </div>
                              <div
                                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800"
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
                              {questPreviewByGoalId[goal.id] ? (
                                <p
                                  className="mt-2 truncate text-[11px] font-medium italic text-zinc-500"
                                  title={questPreviewByGoalId[goal.id]}
                                >
                                  This week: {questPreviewByGoalId[goal.id]}
                                </p>
                              ) : null}
                              <p
                                className="mt-2 text-[11px] font-medium"
                                style={{ color: MUTED_BODY }}
                              >
                                Week {currentW} of {totalW} · {pct}% complete
                              </p>
                            </div>
                          </div>
                        </article>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}

            {pausedGoals.length > 0 ? (
              <section className="mx-auto mt-8 max-w-lg border-t border-zinc-800/60 pt-8">
                <h2
                  className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500"
                >
                  Paused
                </h2>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {pausedGoals.map((goal) => {
                    const { label, emoji } = getGoalCategoryDisplay(goal.category)
                    const pct = clampPercent(goal.progress_percent)
                    const totalW = goal.target_date
                      ? calculateTotalWeeks(goal.target_date)
                      : 1
                    const currentW = goal.created_at
                      ? calculateCurrentWeekFromGoalStart(goal.created_at)
                      : 1
                    const targetCls = targetDateClass(goal.target_date)
                    return (
                      <li key={goal.id}>
                        <Link
                          to={`/goals/${goal.id}`}
                          className="block rounded-2xl outline-none ring-app-accent/0 transition-transform focus-visible:ring-2 focus-visible:ring-app-accent/50 active:scale-[0.98]"
                        >
                          <article
                            className="card-interactive flex min-h-[90px] gap-3 rounded-2xl border p-4 opacity-60 shadow-sm transition-colors hover:bg-white/[0.04]"
                            style={{
                              backgroundColor: CARD_SURFACE,
                              borderColor: CARD_BORDER,
                            }}
                          >
                            <div
                              className="w-[3px] shrink-0 self-stretch rounded-full"
                              style={{ backgroundColor: PAUSED_AMBER }}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-[15px] font-semibold leading-snug text-white">
                                  {goal.title}
                                </h2>
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ring-1"
                                  style={{
                                    backgroundColor: `${PAUSED_AMBER}33`,
                                    color: PAUSED_AMBER,
                                    borderColor: `${PAUSED_AMBER}55`,
                                  }}
                                >
                                  Paused
                                </span>
                              </div>
                              <p
                                className="mt-2 text-xs font-medium"
                                style={{ color: MUTED_BODY }}
                              >
                                <span aria-hidden>{emoji}</span> {label}
                              </p>
                              <p
                                className={`mt-1 text-xs font-medium ${targetCls}`}
                              >
                                Target {formatTargetDate(goal.target_date)}
                              </p>
                              <div className="mt-4">
                                <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
                                  <span>Progress</span>
                                  <span className="tabular-nums text-zinc-500">
                                    {pct}%
                                  </span>
                                </div>
                                <div
                                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800"
                                  role="progressbar"
                                  aria-valuenow={pct}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-label="Goal progress"
                                >
                                  <div
                                    className="h-full rounded-full bg-zinc-600 transition-[width] duration-300"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p
                                  className="mt-2 text-[11px] font-medium italic text-zinc-500"
                                >
                                  Tap to resume
                                </p>
                                <p
                                  className="mt-1 text-[11px] font-medium"
                                  style={{ color: MUTED_BODY }}
                                >
                                  Week {currentW} of {totalW} · {pct}% complete
                                </p>
                              </div>
                            </div>
                          </article>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}

            {completedGoalsError ? (
              <section className="mx-auto mt-10 max-w-lg border-t border-zinc-800/60 pt-8">
                <SectionLoadErrorCard
                  sectionLabel="completed goals"
                  message={completedGoalsError}
                  onRetry={() => void load()}
                />
              </section>
            ) : completedGoals.length > 0 ? (
              <section className="mx-auto mt-10 max-w-lg border-t border-zinc-800/60 pt-8">
                <h2 className="text-lg font-bold text-white">Completed</h2>
                <p className="mt-1 text-sm font-medium text-zinc-500">
                  {completedGoals.length === 1
                    ? '1 goal completed'
                    : `${completedGoals.length} goals completed`}
                </p>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {completedGoals.map((goal) => {
                    const { label, emoji } = getGoalCategoryDisplay(goal.category)
                    const accent = getCategoryBorderColor(goal.category)
                    return (
                      <li key={goal.id}>
                        <Link
                          to={`/goals/${goal.id}`}
                          className="block rounded-2xl outline-none ring-app-accent/0 transition-transform focus-visible:ring-2 focus-visible:ring-app-accent/50 active:scale-[0.98]"
                        >
                          <article
                            className="card-interactive flex gap-3 rounded-2xl border p-4 opacity-90 shadow-sm transition-colors hover:bg-white/[0.04]"
                            style={{
                              backgroundColor: CARD_SURFACE,
                              borderColor: CARD_BORDER,
                            }}
                          >
                            <div
                              className="w-[3px] shrink-0 self-stretch rounded-full opacity-60"
                              style={{ backgroundColor: accent }}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-bold leading-snug text-zinc-200">
                                  {goal.title}
                                </h2>
                                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-400 ring-1 ring-emerald-500/35">
                                  Complete
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-semibold text-zinc-500">
                                <span aria-hidden>{emoji}</span>{' '}
                                <span className="text-zinc-400">{label}</span>
                              </p>
                              <p className="mt-1 text-xs font-medium text-zinc-600">
                                Completed{' '}
                                <span className="text-zinc-500">
                                  {formatCompletedAt(goal.completed_at)}
                                </span>
                              </p>
                            </div>
                          </article>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}

        {hasFitnessCategory ? (
        <section className="mx-auto mt-12 max-w-lg border-t border-zinc-800/50 pt-10">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-white">Fitness Habits</h2>
            <button
              type="button"
              aria-expanded={fitnessInfoOpen}
              aria-label={
                fitnessInfoOpen
                  ? 'Hide fitness habits info'
                  : 'Show fitness habits info'
              }
              onClick={() => setFitnessInfoOpen((open) => !open)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-600 text-xs font-bold text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
            >
              i
            </button>
          </div>
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{
              gridTemplateRows: fitnessInfoOpen ? '1fr' : '0fr',
            }}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={[
                  'mt-3 transform transition-[opacity,transform] duration-300 ease-out',
                  fitnessInfoOpen
                    ? 'translate-y-0 opacity-100'
                    : 'pointer-events-none -translate-y-1 opacity-0',
                ].join(' ')}
              >
                <div
                  className="flex gap-3 rounded-xl border border-zinc-800/80 px-3 py-3"
                  style={{
                    backgroundColor: '#141418',
                    borderLeftWidth: 3,
                    borderLeftColor: GOAL_PURPLE,
                  }}
                >
                  <p className="text-[13px] font-medium leading-snug text-zinc-500">
                    InHabit helps you stay consistent with fitness — not generate
                    workout plans. Add these habits to track your daily showing up,
                    and pair with your favourite training app for programming.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-sm font-medium leading-snug text-zinc-500">
            Track your consistency — bring your own program.
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            {FITNESS_QUICK_HABITS.map((h) => {
              const has = fitnessQuickHabitAlreadyAdded(h.title, fitnessHabitTitles)
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
        ) : null}
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
