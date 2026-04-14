import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  LinearScale,
  Tooltip,
} from 'chart.js'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Bar } from 'react-chartjs-2'
import { Link, useLocation } from 'react-router-dom'
import { RankShield } from '../components/RankShield'
import {
  getCategoryBorderColor,
  getGoalCategoryDisplay,
} from '../constants/goalCategoryPills'
import {
  calculateCurrentWeekFromGoalStart,
  calculateTotalWeeks,
} from '../lib/goalProgress'
import {
  formatIsoWeekRangeLabel,
  getLocalISOWeek,
  getLocalISOWeekYear,
  startOfLocalWeekMonday,
} from '../lib/isoWeek'
import { streakTierTextStyle } from '../lib/streakTierStyle'
import {
  pickActiveQuest,
  type PickableQuest,
  type QuestProgressionMode,
} from '../lib/weeklyQuestPick'
import {
  calculateRank,
  checkAndResetWeeklyXp,
  getWeeklyRankBandProgress,
  rankColor,
  xpForNextLevel,
  MAX_LEVEL,
} from '../lib/xp'
import { supabase } from '../supabase'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

const CARD_BG = '#141418'
const CARD_BORDER = 'rgba(255,255,255,0.08)'
const MUTED_BODY = '#888780'
const MUTED_VERY = 'rgba(136, 135, 128, 0.65)'

const SECTION_HEAD_CLASS =
  'shrink-0 text-[10px] font-medium uppercase tracking-[0.08em]'

const BAR_TRACK = '#2A2A2E'
const BAR_PURPLE = '#534AB7'
const BAR_HOVER = '#7F77DD'
const BAR_CURRENT = '#9D94F0'
const BAR_CURRENT_HOVER = '#C4BFFF'
const GRID_LINE = '#2A2A2E'

const STAT_PURPLE = '#534AB7'
const STAT_AMBER = '#F59E0B'
const STAT_ORANGE = '#FF6B35'
const STAT_GREEN = '#34D399'

type ReflectionHistoryRow = {
  id: string
  week_number: number
  iso_week_year: number | null
  mission_completion_rate: number | null
  ai_insight: string | null
  win_answer: string | null
  miss_answer: string | null
  improve_answer: string | null
  xp_earned: number | null
  created_at: string
}

type GoalRow = {
  id: string
  title: string
  category: string | null
  target_date: string | null
  progress_percent: number
  created_at?: string
}

type HabitRow = {
  id: string
  title: string
  category: string | null
  current_streak: number
}

function formatShortMd(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function localDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function buildLastSixWeekBuckets(): { mondays: Date[]; weekKeys: string[] } {
  const todayMon = startOfLocalWeekMonday(new Date())
  const mondays: Date[] = []
  const weekKeys: string[] = []
  for (let w = 5; w >= 0; w--) {
    const d = new Date(todayMon)
    d.setDate(todayMon.getDate() - w * 7)
    mondays.push(d)
    const y = getLocalISOWeekYear(d)
    const n = getLocalISOWeek(d)
    weekKeys.push(`${y}-${n}`)
  }
  return { mondays, weekKeys }
}

function aggregateWeeklyXp(
  logs: { amount: number; created_at: string }[],
  weekKeys: string[],
): number[] {
  const sums = new Map<string, number>()
  for (const row of logs) {
    if (typeof row.amount !== 'number' || row.amount <= 0) continue
    const t = new Date(row.created_at)
    if (Number.isNaN(t.getTime())) continue
    const y = getLocalISOWeekYear(t)
    const w = getLocalISOWeek(t)
    const key = `${y}-${w}`
    sums.set(key, (sums.get(key) ?? 0) + row.amount)
  }
  return weekKeys.map((k) => sums.get(k) ?? 0)
}

function WeeklyXpBarChart({
  labels,
  values,
}: {
  labels: string[]
  values: number[]
}) {
  const data = useMemo(() => {
    const currentIdx = Math.max(0, values.length - 1)
    const bgColors = values.map((_, i) =>
      i === currentIdx ? BAR_CURRENT : BAR_PURPLE,
    )
    const hoverColors = values.map((_, i) =>
      i === currentIdx ? BAR_CURRENT_HOVER : BAR_HOVER,
    )
    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: bgColors,
          hoverBackgroundColor: hoverColors,
          borderWidth: 0,
          borderRadius: 6,
          maxBarThickness: 36,
        },
      ],
    }
  }, [labels, values])

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 6, bottom: 0, left: 0, right: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e1e22',
          titleColor: '#fafafa',
          bodyColor: '#a1a1aa',
          borderColor: GRID_LINE,
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y
              const n = typeof v === 'number' ? Math.round(v) : 0
              return `${n.toLocaleString()} XP`
            },
          },
        },
      },
      scales: {
        x: {
          border: { display: false },
          grid: { color: GRID_LINE, lineWidth: 1 },
          ticks: { color: '#71717a', font: { size: 11 } },
        },
        y: {
          border: { display: false },
          grid: { color: GRID_LINE, lineWidth: 1 },
          ticks: {
            color: '#71717a',
            font: { size: 11 },
            precision: 0,
            callback: (val) => {
              const n = typeof val === 'number' ? val : Number(val)
              return Number.isFinite(n) ? Math.round(n).toLocaleString() : ''
            },
          },
        },
      },
    }),
    [],
  )

  return (
    <div className="h-[160px] w-full">
      <Bar data={data} options={options} />
    </div>
  )
}

function clampPercent(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.min(100, Math.max(0, n))
}

function formatTargetDate(isoDate: string | null): string {
  if (!isoDate) return '—'
  const parts = isoDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate
  const [y, m, d] = parts
  const local = new Date(y, m - 1, d)
  return local.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

function dueDateClass(isoDate: string | null): string {
  const days = daysUntilTarget(isoDate)
  if (days == null) return 'text-[#888780]'
  if (days <= 14) return 'text-red-400'
  if (days <= 30) return 'text-amber-400'
  return 'text-[#888780]'
}

function missionRateBadgeClass(rate: number): string {
  if (rate >= 80) return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/35'
  if (rate >= 50) return 'bg-amber-500/15 text-amber-200 ring-amber-500/35'
  return 'bg-red-500/15 text-red-300 ring-red-500/35'
}

function StatCard({
  accent,
  label,
  value,
  sub,
}: {
  accent: string
  label: string
  value: string
  sub?: string | null
}) {
  return (
    <div
      className="rounded-xl border border-l-[3px] px-4 py-3 transition-colors hover:bg-white/[0.04]"
      style={{
        backgroundColor: CARD_BG,
        borderColor: CARD_BORDER,
        borderLeftColor: accent,
      }}
    >
      <p className="text-[28px] font-bold tabular-nums leading-none text-white">
        {value}
      </p>
      <p className="mt-1.5 text-xs font-semibold" style={{ color: MUTED_BODY }}>
        {label}
      </p>
      {sub ? (
        <p
          className="mt-0.5 text-[11px] font-medium"
          style={{ color: MUTED_VERY }}
        >
          {sub}
        </p>
      ) : null}
    </div>
  )
}

function SectionHeadingRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex items-center gap-3 px-4">
      <span className={SECTION_HEAD_CLASS} style={{ color: MUTED_BODY }}>
        {children}
      </span>
      <div className="h-px min-w-[2rem] flex-1 bg-zinc-800/50" aria-hidden />
    </div>
  )
}

function dayInitialFromOffset(daysAgo: number): string {
  const d = localDayStart(new Date())
  d.setDate(d.getDate() - (6 - daysAgo))
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()] ?? '?'
}

export function Progress() {
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [weeklyXp, setWeeklyXp] = useState(0)
  const [totalXp, setTotalXp] = useState(0)
  const [level, setLevel] = useState(1)
  const [longestStreak, setLongestStreak] = useState(0)
  const [missionsDone, setMissionsDone] = useState<number | null>(null)

  const [chartLabels, setChartLabels] = useState<string[]>([])
  const [chartValues, setChartValues] = useState<number[]>([])

  const [goals, setGoals] = useState<GoalRow[]>([])
  const [questPreviewByGoalId, setQuestPreviewByGoalId] = useState<
    Record<string, string>
  >({})

  const [habits, setHabits] = useState<HabitRow[]>([])
  const [habitCompletionById, setHabitCompletionById] = useState<
    Record<string, boolean[]>
  >({})

  const [reflectionRows, setReflectionRows] = useState<ReflectionHistoryRow[]>(
    [],
  )
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()

    if (authErr || !user) {
      setLoading(false)
      setError(authErr?.message ?? 'Not signed in')
      return
    }

    try {
      await checkAndResetWeeklyXp(user.id)
    } catch (e) {
      console.error('checkAndResetWeeklyXp (Progress) failed:', e)
    }

    const { mondays, weekKeys } = buildLastSixWeekBuckets()
    const oldestMon = mondays[0]!
    const chartCutoff = new Date(oldestMon)
    chartCutoff.setHours(0, 0, 0, 0)
    chartCutoff.setDate(chartCutoff.getDate() - 1)

    const habitGridStart = localDayStart(new Date())
    habitGridStart.setDate(habitGridStart.getDate() - 6)
    habitGridStart.setHours(0, 0, 0, 0)

    const [
      userRes,
      xpLogsRes,
      missionsCountRes,
      goalsRes,
      habitsRes,
      habitLogsRes,
      reflectionsRes,
    ] = await Promise.all([
      supabase
        .from('users')
        .select(
          'weekly_xp, total_xp, level, longest_streak, quest_progression',
        )
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('xp_logs')
        .select('amount, created_at')
        .eq('user_id', user.id)
        .gte('created_at', chartCutoff.toISOString()),
      supabase
        .from('daily_missions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', true),
      supabase
        .from('goals')
        .select('id,title,category,target_date,progress_percent,created_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('habits')
        .select('id,title,category,current_streak')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('habit_logs')
        .select('habit_id, completed_at')
        .eq('user_id', user.id)
        .gte('completed_at', habitGridStart.toISOString()),
      supabase
        .from('reflections')
        .select(
          'id,week_number,iso_week_year,mission_completion_rate,ai_insight,win_answer,miss_answer,improve_answer,xp_earned,created_at',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(24),
    ])

    setLoading(false)

    if (userRes.error || !userRes.data) {
      setError(userRes.error?.message ?? 'No profile found')
      return
    }

    const u = userRes.data as Record<string, unknown>
    setWeeklyXp(
      typeof u.weekly_xp === 'number' && !Number.isNaN(u.weekly_xp)
        ? Math.max(0, Math.floor(u.weekly_xp))
        : 0,
    )
    setTotalXp(
      typeof u.total_xp === 'number' && !Number.isNaN(u.total_xp)
        ? Math.max(0, Math.floor(u.total_xp))
        : 0,
    )
    setLevel(
      typeof u.level === 'number' && !Number.isNaN(u.level)
        ? Math.max(1, Math.floor(u.level))
        : 1,
    )
    setLongestStreak(
      typeof u.longest_streak === 'number' && !Number.isNaN(u.longest_streak)
        ? Math.max(0, Math.floor(u.longest_streak))
        : 0,
    )

    const questMode: QuestProgressionMode =
      u.quest_progression === 'completion' ? 'completion' : 'weekly'

    if (xpLogsRes.error) {
      console.error('Progress xp_logs:', xpLogsRes.error)
    }
    const logs = (xpLogsRes.data ?? []) as { amount: number; created_at: string }[]
    const agg = aggregateWeeklyXp(logs, weekKeys)
    setChartLabels(mondays.map((d) => formatShortMd(d)))
    setChartValues(agg)

    if (missionsCountRes.error) {
      console.error('Progress missions count:', missionsCountRes.error)
      setMissionsDone(null)
    } else {
      setMissionsDone(
        typeof missionsCountRes.count === 'number' ? missionsCountRes.count : 0,
      )
    }

    if (goalsRes.error) {
      console.error('Progress goals:', goalsRes.error)
      setGoals([])
      setQuestPreviewByGoalId({})
    } else {
      const goalsList = (goalsRes.data ?? []) as GoalRow[]
      setGoals(goalsList)

      const goalIds = goalsList.map((g) => g.id)
      const nextPreviews: Record<string, string> = {}
      if (goalIds.length > 0) {
        const wqRes = await supabase
          .from('weekly_quests')
          .select('id,goal_id,title,week_number,completed')
          .eq('user_id', user.id)
          .in('goal_id', goalIds)

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
      }
      setQuestPreviewByGoalId(nextPreviews)
    }

    if (habitsRes.error) {
      console.error('Progress habits:', habitsRes.error)
      setHabits([])
      setHabitCompletionById({})
    } else {
      const hrows = (habitsRes.data ?? []) as Record<string, unknown>[]
      const parsed: HabitRow[] = hrows
        .map((r) => ({
          id: typeof r.id === 'string' ? r.id : '',
          title: typeof r.title === 'string' ? r.title : '',
          category: typeof r.category === 'string' ? r.category : null,
          current_streak:
            typeof r.current_streak === 'number' && !Number.isNaN(r.current_streak)
              ? Math.max(0, Math.floor(r.current_streak))
              : 0,
        }))
        .filter((r) => r.id !== '' && r.title !== '')
      setHabits(parsed)

      const dayKeys: string[] = []
      for (let i = 6; i >= 0; i--) {
        const d = localDayStart(new Date())
        d.setDate(d.getDate() - i)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        dayKeys.push(`${y}-${m}-${day}`)
      }

      const logDaysByHabit = new Map<string, Set<string>>()
      if (!habitLogsRes.error && habitLogsRes.data) {
        for (const row of habitLogsRes.data as {
          habit_id?: string
          completed_at?: string
        }[]) {
          const hid = typeof row.habit_id === 'string' ? row.habit_id : ''
          if (!hid || !row.completed_at) continue
          const dt = new Date(row.completed_at)
          if (Number.isNaN(dt.getTime())) continue
          const ld = localDayStart(dt)
          const y = ld.getFullYear()
          const m = String(ld.getMonth() + 1).padStart(2, '0')
          const day = String(ld.getDate()).padStart(2, '0')
          const key = `${y}-${m}-${day}`
          if (!logDaysByHabit.has(hid)) logDaysByHabit.set(hid, new Set())
          logDaysByHabit.get(hid)!.add(key)
        }
      }

      const completion: Record<string, boolean[]> = {}
      for (const h of parsed) {
        const set = logDaysByHabit.get(h.id) ?? new Set()
        completion[h.id] = dayKeys.map((k) => set.has(k))
      }
      setHabitCompletionById(completion)
    }

    if (reflectionsRes.error) {
      console.error('Progress reflections:', reflectionsRes.error)
      setReflectionRows([])
    } else {
      setReflectionRows((reflectionsRes.data ?? []) as ReflectionHistoryRow[])
    }
  }, [])

  useEffect(() => {
    if (location.pathname !== '/progress') return
    void load()
  }, [location.pathname, load])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (location.pathname !== '/progress') return
      void load()
    }
    const onWindowFocus = () => {
      if (location.pathname !== '/progress') return
      void load()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onWindowFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onWindowFocus)
    }
  }, [load, location.pathname])

  const displayRank = calculateRank(weeklyXp)
  const rankHue = rankColor(displayRank)
  const weeklyBand = getWeeklyRankBandProgress(weeklyXp)
  const weeklyBarPct =
    weeklyBand.kind === 'legend' ? 100 : weeklyBand.percent

  const xpToNext =
    level >= MAX_LEVEL
      ? null
      : Math.max(0, Math.ceil(xpForNextLevel(level) - totalXp))

  function weekRangeHeading(r: ReflectionHistoryRow): string {
    const y =
      r.iso_week_year ?? getLocalISOWeekYear(new Date(r.created_at))
    return `Week of ${formatIsoWeekRangeLabel(y, r.week_number)}`
  }

  const todayYmd = useMemo(() => {
    const d = localDayStart(new Date())
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="shrink-0 border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Progress
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Proof of your consistency and growth
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-12 pt-6">
        <div className="mx-auto max-w-lg space-y-6">
          {error ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-app-bg"
              >
                Retry
              </button>
            </div>
          ) : null}

          {!error && loading ? (
            <>
              <div className="px-0 pb-5 pt-6 text-center">
                <div className="mx-auto h-[140px] w-[120px] rounded-xl mission-skeleton-shell" />
                <div className="mx-auto mt-4 h-4 w-32 rounded-md mission-skeleton-shell" />
                <div className="mx-auto mt-3 h-3 w-full max-w-[240px] rounded-md mission-skeleton-shell" />
              </div>
              <div
                className="mission-skeleton-shell h-[160px] w-full rounded-xl border p-4"
                style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
              />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="mission-skeleton-shell h-[108px] rounded-xl border border-zinc-800/60"
                    style={{ backgroundColor: CARD_BG }}
                  />
                ))}
              </div>
              <div>
                <div className="h-3 w-28 rounded mission-skeleton-shell" />
                <div className="mt-4 space-y-3">
                  <div className="mission-skeleton-shell h-[120px] rounded-2xl border border-zinc-800/60" />
                  <div className="mission-skeleton-shell h-[120px] rounded-2xl border border-zinc-800/60" />
                </div>
              </div>
              <div>
                <div className="h-3 w-36 rounded mission-skeleton-shell" />
                <div className="mt-4 space-y-3">
                  <div className="mission-skeleton-shell h-14 rounded-xl border border-zinc-800/60" />
                  <div className="mission-skeleton-shell h-14 rounded-xl border border-zinc-800/60" />
                </div>
              </div>
              <div>
                <div className="h-3 w-24 rounded mission-skeleton-shell" />
                <div className="mt-4 space-y-3">
                  <div className="mission-skeleton-shell min-h-[100px] rounded-2xl border border-zinc-800/60" />
                </div>
              </div>
            </>
          ) : null}

          {!error && !loading ? (
            <>
              <section aria-label="Weekly rank" className="text-center">
                <div className="pt-6 pb-5">
                  <RankShield rankName={displayRank} accentColor={rankHue} />
                  <p
                    className="mt-3 text-[14px] font-medium leading-snug"
                    style={{ color: MUTED_BODY }}
                  >
                    {weeklyXp.toLocaleString()} XP this week
                  </p>
                  <p className="mt-4 text-sm font-medium leading-snug text-zinc-400">
                    {weeklyBand.kind === 'legend' ? (
                      <>Maximum rank achieved</>
                    ) : (
                      <>
                        {weeklyBand.progressInBand.toLocaleString()} /{' '}
                        {weeklyBand.bandSize.toLocaleString()} XP toward{' '}
                        <span
                          style={{ color: rankColor(weeklyBand.nextRank) }}
                        >
                          {weeklyBand.nextRank}
                        </span>
                      </>
                    )}
                  </p>
                  <div className="mt-3 w-full">
                    <div
                      className="h-2 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: BAR_TRACK }}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{
                          width: `${weeklyBarPct}%`,
                          backgroundColor: rankHue,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div
                  className="border-b"
                  style={{ borderColor: CARD_BORDER }}
                  aria-hidden
                />
              </section>

              <section aria-label="Weekly XP chart">
                <SectionHeadingRow>Weekly XP</SectionHeadingRow>
                <p
                  className="mt-2 text-[11px] font-medium"
                  style={{ color: MUTED_VERY }}
                >
                  Last 6 weeks
                </p>
                <div
                  className="mt-4 rounded-xl border p-4"
                  style={{
                    backgroundColor: CARD_BG,
                    borderColor: CARD_BORDER,
                  }}
                >
                  {chartValues.length > 0 &&
                  chartValues.every((v) => v === 0) ? (
                    <div
                      className="flex h-[160px] items-center justify-center px-4 text-center text-[13px] font-medium"
                      style={{ color: MUTED_BODY }}
                    >
                      Complete missions to start earning XP
                    </div>
                  ) : (
                    <WeeklyXpBarChart
                      labels={chartLabels}
                      values={chartValues}
                    />
                  )}
                </div>
              </section>

              <section aria-label="Stats">
                <SectionHeadingRow>Stats</SectionHeadingRow>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <StatCard
                    accent={STAT_PURPLE}
                    label="Total XP"
                    value={totalXp.toLocaleString()}
                  />
                  <StatCard
                    accent={STAT_AMBER}
                    label="Level"
                    value={String(level)}
                    sub={
                      xpToNext == null
                        ? 'Max level'
                        : `${xpToNext.toLocaleString()} XP to next level`
                    }
                  />
                  <StatCard
                    accent={STAT_ORANGE}
                    label="Best streak"
                    value={String(longestStreak)}
                    sub="days"
                  />
                  <StatCard
                    accent={STAT_GREEN}
                    label="Missions done"
                    value={
                      missionsDone == null
                        ? '—'
                        : missionsDone.toLocaleString()
                    }
                  />
                </div>
              </section>

              <section aria-labelledby="progress-goals-heading">
                <div id="progress-goals-heading" className="sr-only">
                  Active goals
                </div>
                <SectionHeadingRow>Active goals</SectionHeadingRow>
                {goals.length === 0 ? (
                  <p
                    className="mt-4 text-sm font-medium"
                    style={{ color: MUTED_BODY }}
                  >
                    No active goals — create one on the Goals tab
                  </p>
                ) : (
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {goals.map((goal) => {
                      const { label, emoji } = getGoalCategoryDisplay(
                        goal.category,
                      )
                      const accent = getCategoryBorderColor(goal.category)
                      const pct = clampPercent(goal.progress_percent)
                      const totalW = goal.target_date
                        ? calculateTotalWeeks(goal.target_date)
                        : 1
                      const currentW = goal.created_at
                        ? calculateCurrentWeekFromGoalStart(goal.created_at)
                        : 1
                      const targetCls = dueDateClass(goal.target_date)
                      return (
                        <li key={goal.id}>
                          <Link
                            to={`/goals/${goal.id}`}
                            className="block rounded-2xl outline-none ring-app-accent/0 transition-transform focus-visible:ring-2 focus-visible:ring-app-accent/50 active:scale-[0.98]"
                          >
                            <article
                              className="flex min-h-[90px] gap-3 rounded-2xl border p-4 shadow-sm transition-colors hover:bg-white/[0.04]"
                              style={{
                                backgroundColor: CARD_BG,
                                borderColor: CARD_BORDER,
                              }}
                            >
                              <div
                                className="w-[3px] shrink-0 self-stretch rounded-full"
                                style={{ backgroundColor: accent }}
                                aria-hidden
                              />
                              <div className="min-w-0 flex-1">
                                <h3 className="text-[15px] font-semibold leading-snug text-white">
                                  {goal.title}
                                </h3>
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
                                    Week {currentW} of {totalW} · {pct}%
                                    complete
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
              </section>

              <section aria-labelledby="progress-habits-heading">
                <div id="progress-habits-heading" className="sr-only">
                  Habit consistency
                </div>
                <SectionHeadingRow>Habit consistency</SectionHeadingRow>
                {habits.length === 0 ? (
                  <p
                    className="mt-4 text-sm font-medium"
                    style={{ color: MUTED_BODY }}
                  >
                    No habits yet — add them on the Today tab
                  </p>
                ) : (
                  <ul className="mt-4 flex flex-col gap-3">
                    {habits.map((h) => {
                      const { emoji } = getGoalCategoryDisplay(h.category)
                      const cells = habitCompletionById[h.id] ?? []
                      return (
                        <li
                          key={h.id}
                          className="rounded-lg border px-4 py-3"
                          style={{
                            backgroundColor: CARD_BG,
                            borderColor: CARD_BORDER,
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-medium text-white">
                              {h.title}
                            </p>
                            <p
                              className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums"
                              style={streakTierTextStyle(h.current_streak)}
                            >
                              <span aria-hidden>{emoji}</span>
                              <span aria-hidden>{'\u{1F525}'} </span>
                              {h.current_streak}
                            </p>
                          </div>
                          <div
                            className="mt-3 flex gap-1.5"
                            aria-hidden
                          >
                            {cells.map((_, idx) => (
                              <span
                                key={`init-${idx}`}
                                className="inline-flex w-2.5 shrink-0 justify-center text-[10px] font-medium"
                                style={{ color: MUTED_VERY }}
                              >
                                {dayInitialFromOffset(idx)}
                              </span>
                            ))}
                          </div>
                          <div
                            className="mt-1 flex gap-1.5"
                            role="list"
                            aria-label="Last 7 days"
                          >
                            {cells.map((done, idx) => {
                              const d = localDayStart(new Date())
                              d.setDate(d.getDate() - (6 - idx))
                              const y = d.getFullYear()
                              const m = String(d.getMonth() + 1).padStart(
                                2,
                                '0',
                              )
                              const day = String(d.getDate()).padStart(2, '0')
                              const ymd = `${y}-${m}-${day}`
                              const isToday = ymd === todayYmd
                              return (
                                <span
                                  key={ymd}
                                  role="listitem"
                                  title={formatShortMd(d)}
                                  className={[
                                    'inline-block size-2.5 shrink-0 rounded-full',
                                    done ? 'bg-[#1D9E75]' : 'bg-zinc-800',
                                    isToday
                                      ? 'box-border border-[1.5px] border-white'
                                      : '',
                                  ].join(' ')}
                                />
                              )
                            })}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section aria-labelledby="progress-reflections-heading">
                <div id="progress-reflections-heading" className="sr-only">
                  Reflections
                </div>
                <SectionHeadingRow>Reflections</SectionHeadingRow>
                {reflectionRows.length === 0 ? (
                  <p
                    className="mt-4 text-sm font-medium"
                    style={{ color: MUTED_BODY }}
                  >
                    No reflections yet — complete your first one on Sunday
                  </p>
                ) : (
                  <ul className="mt-4 flex flex-col gap-3">
                    {reflectionRows.map((r) => {
                      const insight = r.ai_insight?.trim() ?? ''
                      const hasAnswers = !!(
                        r.win_answer?.trim() ||
                        r.miss_answer?.trim() ||
                        r.improve_answer?.trim()
                      )
                      const isOpen = !!expanded[r.id]
                      const rate = r.mission_completion_rate
                      const xpEarned =
                        typeof r.xp_earned === 'number' &&
                        !Number.isNaN(r.xp_earned)
                          ? Math.round(r.xp_earned)
                          : null
                      const showExpandToggle =
                        insight.length > 0 || hasAnswers || xpEarned != null
                      const needsReadMore =
                        insight.length > 80 || hasAnswers || xpEarned != null
                      return (
                        <li
                          key={r.id}
                          className="rounded-xl border p-4"
                          style={{
                            backgroundColor: CARD_BG,
                            borderColor: CARD_BORDER,
                          }}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-white">
                              {weekRangeHeading(r)}
                            </p>
                            {rate != null ? (
                              <span
                                className={[
                                  'inline-flex shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold tabular-nums ring-1',
                                  missionRateBadgeClass(rate),
                                ].join(' ')}
                              >
                                {rate}%
                              </span>
                            ) : null}
                          </div>
                          {!isOpen ? (
                            <div className="mt-3">
                              {insight ? (
                                <p
                                  className="line-clamp-2 text-[13px] font-medium italic leading-snug"
                                  style={{ color: MUTED_BODY }}
                                >
                                  {insight}
                                </p>
                              ) : (
                                <p
                                  className="text-[13px] font-medium"
                                  style={{ color: MUTED_VERY }}
                                >
                                  No coaching note for this week
                                </p>
                              )}
                              {showExpandToggle && needsReadMore ? (
                                <button
                                  type="button"
                                  className="mt-3 text-xs font-semibold text-[#534AB7] transition-colors hover:underline"
                                  onClick={() =>
                                    setExpanded((prev) => ({
                                      ...prev,
                                      [r.id]: true,
                                    }))
                                  }
                                >
                                  Read more →
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          <div
                            className={[
                              'grid transition-[grid-template-rows] duration-300 ease-out',
                              isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                            ].join(' ')}
                          >
                            <div className="min-h-0 overflow-hidden">
                              {isOpen ? (
                                <div className="space-y-4 pt-3">
                                  {insight ? (
                                    <p className="text-[13px] leading-relaxed text-white">
                                      {insight}
                                    </p>
                                  ) : (
                                    <p
                                      className="text-[13px] font-medium"
                                      style={{ color: MUTED_VERY }}
                                    >
                                      No coaching note for this week
                                    </p>
                                  )}
                                  {hasAnswers ? (
                                    <div className="space-y-4">
                                      <div>
                                        <p
                                          className="text-[10px] font-semibold uppercase tracking-wide"
                                          style={{ color: MUTED_BODY }}
                                        >
                                          Your win:
                                        </p>
                                        <p className="mt-1 text-[13px] text-white">
                                          {r.win_answer?.trim() || '—'}
                                        </p>
                                      </div>
                                      <div>
                                        <p
                                          className="text-[10px] font-semibold uppercase tracking-wide"
                                          style={{ color: MUTED_BODY }}
                                        >
                                          You struggled with:
                                        </p>
                                        <p className="mt-1 text-[13px] text-white">
                                          {r.miss_answer?.trim() || '—'}
                                        </p>
                                      </div>
                                      <div>
                                        <p
                                          className="text-[10px] font-semibold uppercase tracking-wide"
                                          style={{ color: MUTED_BODY }}
                                        >
                                          You&apos;ll change:
                                        </p>
                                        <p className="mt-1 text-[13px] text-white">
                                          {r.improve_answer?.trim() || '—'}
                                        </p>
                                      </div>
                                    </div>
                                  ) : null}
                                  {xpEarned != null ? (
                                    <p className="text-[13px] font-medium text-white">
                                      <span style={{ color: MUTED_BODY }}>
                                        XP earned:
                                      </span>{' '}
                                      <span className="tabular-nums">
                                        {xpEarned.toLocaleString()}
                                      </span>
                                    </p>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpanded((prev) => ({
                                        ...prev,
                                        [r.id]: false,
                                      }))
                                    }
                                    className="text-xs font-semibold transition-colors"
                                    style={{ color: MUTED_VERY }}
                                  >
                                    Show less ↑
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
