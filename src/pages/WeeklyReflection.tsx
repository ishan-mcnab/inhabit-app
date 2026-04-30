import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { SectionLoadErrorCard } from '../components/SectionLoadErrorCard'
import { XPToast } from '../components/XPToast'
import { useXpToastQueue } from '../hooks/useXpToastQueue'
import {
  formatWeekOfRangeLabel,
  getLocalISOWeek,
  getLocalISOWeekYear,
  localWeekMondaySundayYmd,
  mondayOfIsoWeek,
  previousIsoWeek,
} from '../lib/isoWeek'
import { weeklyReflectionCoachInsight } from '../lib/openRouterSingle'
import { awardXP, localWeekStartEndIso } from '../lib/xp'
import { supabase } from '../supabase'

const REFLECTION_ACCENT = '#F5A623'
const MAX_CHARS = 500
const MIN_SUBMIT = 10
const TEXTAREA_MIN_PX = 100

type WeekStats = {
  missionsCompleted: number
  missionsTotal: number
  completionRate: number
  habitsCompleted: number
  weeklyXp: number
  streak: number
}

type ReflectionRow = {
  id: string
  week_number: number
  iso_week_year: number
  win_answer: string | null
  miss_answer: string | null
  improve_answer: string | null
  ai_insight: string | null
  xp_earned: number
  mission_completion_rate: number | null
}

type ReflectionUserContext = {
  goalCategories: string[]
  goalContext: Record<string, any>
  displayName: string
}

function AutoGrowTextarea({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const adjust = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(TEXTAREA_MIN_PX, el.scrollHeight)}px`
  }, [])

  useEffect(() => {
    adjust()
  }, [value, adjust])

  return (
    <textarea
      ref={ref}
      id={id}
      value={value}
      disabled={disabled}
      maxLength={MAX_CHARS}
      rows={4}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))}
      className="min-h-[100px] w-full resize-none rounded-xl border border-zinc-800 bg-[#111827] px-3 py-2.5 text-sm text-white outline-none transition-[border-color,box-shadow] placeholder:text-zinc-600 focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/35 disabled:opacity-60"
    />
  )
}

function CompletionView({
  heading = 'Reflection complete',
  insight,
  showFreshXp,
  answers,
  showComeBack,
}: {
  heading?: string
  insight: string
  showFreshXp: boolean
  answers?: {
    win: string
    miss: string
    improve: string
  }
  showComeBack?: boolean
}) {
  const navigate = useNavigate()
  return (
    <div className="mx-auto flex max-w-lg flex-col px-4 pb-12 pt-2">
      <div className="flex flex-col items-center pt-6">
        <span
          className="text-5xl font-light text-emerald-400"
          aria-hidden
        >
          ✓
        </span>
        <h2 className="mt-4 text-xl font-bold text-white">{heading}</h2>
        {showFreshXp ? (
          <p className="mt-2 text-lg font-bold text-amber-400">+75 XP</p>
        ) : null}
      </div>
      {answers ? (
        <div className="mt-8 space-y-4 rounded-2xl border border-zinc-800/80 bg-app-surface p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Biggest win
            </p>
            <p className="mt-1 text-sm text-zinc-300">{answers.win}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              What you avoided
            </p>
            <p className="mt-1 text-sm text-zinc-300">{answers.miss}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Next week
            </p>
            <p className="mt-1 text-sm text-zinc-300">{answers.improve}</p>
          </div>
        </div>
      ) : null}
      <div
        className="mt-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-4 pl-5"
        style={{ borderLeftWidth: 4, borderLeftColor: REFLECTION_ACCENT }}
      >
        <p
          className={[
            'text-sm leading-relaxed',
            insight === 'Insight unavailable'
              ? 'font-medium italic text-zinc-500'
              : 'font-semibold text-zinc-200',
          ].join(' ')}
        >
          {insight}
        </p>
      </div>
      {showComeBack ? (
        <p className="mt-6 text-center text-sm text-zinc-500">
          Come back next Sunday for your next reflection.
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => navigate('/today')}
        className="mt-8 w-full rounded-xl py-3.5 text-sm font-bold text-white transition-opacity active:opacity-90"
        style={{ backgroundColor: REFLECTION_ACCENT }}
      >
        Back to Today
      </button>
    </div>
  )
}

export function WeeklyReflection() {
  const navigate = useNavigate()
  const {
    toast: xpToast,
    enqueueXpToast,
    enqueueStreakToast,
    onXpToastHide,
  } = useXpToastQueue()

  const [phase, setPhase] = useState<
    'loading' | 'form' | 'submitting' | 'complete' | 'already' | 'error'
  >('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null)
  const [existingReflection, setExistingReflection] =
    useState<ReflectionRow | null>(null)
  const [userCtx, setUserCtx] = useState<ReflectionUserContext | null>(null)

  const [win, setWin] = useState('')
  const [miss, setMiss] = useState('')
  const [improve, setImprove] = useState('')
  const [completeInsight, setCompleteInsight] = useState('')
  const [completeWeeklyXp, setCompleteWeeklyXp] = useState<number | null>(null)

  const [weekLabel, setWeekLabel] = useState(() =>
    formatWeekOfRangeLabel(new Date()),
  )
  const isoRef = useRef({ week: getLocalISOWeek(new Date()), year: getLocalISOWeekYear(new Date()) })
  const loadGenRef = useRef(0)

  const canSubmit =
    win.trim().length >= MIN_SUBMIT &&
    miss.trim().length >= MIN_SUBMIT &&
    improve.trim().length >= MIN_SUBMIT

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current
    setPhase('loading')
    setLoadError(null)

    const now = new Date()
    const dow = now.getDay()
    const cw = getLocalISOWeek(now)
    const cy = getLocalISOWeekYear(now)
    const { week: pw, isoYear: py } = previousIsoWeek(cw, cy)

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      if (loadGenRef.current !== gen) return
      setLoadError(authErr?.message ?? 'Not signed in')
      setPhase('error')
      return
    }

    const [curRes, prevRes, userResEarly] = await Promise.all([
      supabase
        .from('reflections')
        .select(
          'id,week_number,iso_week_year,win_answer,miss_answer,improve_answer,ai_insight,xp_earned,mission_completion_rate',
        )
        .eq('user_id', user.id)
        .eq('iso_week_year', cy)
        .eq('week_number', cw)
        .maybeSingle(),
      supabase
        .from('reflections')
        .select(
          'id,week_number,iso_week_year,win_answer,miss_answer,improve_answer,ai_insight,xp_earned,mission_completion_rate',
        )
        .eq('user_id', user.id)
        .eq('iso_week_year', py)
        .eq('week_number', pw)
        .maybeSingle(),
      supabase
        .from('users')
        .select(
          'weekly_xp, current_streak, display_name, goal_categories, goal_context',
        )
        .eq('id', user.id)
        .maybeSingle(),
    ])

    if (curRes.error || prevRes.error) {
      if (loadGenRef.current !== gen) return
      setLoadError(curRes.error?.message ?? prevRes.error?.message ?? 'Error')
      setPhase('error')
      return
    }

    const existingCur = curRes.data as ReflectionRow | null
    const existingPrev = prevRes.data as ReflectionRow | null

    if (dow === 0) {
      if (existingCur) {
        if (loadGenRef.current !== gen) return
        setExistingReflection(existingCur)
        setPhase('already')
        setWeekLabel(formatWeekOfRangeLabel(now))
        return
      }
      isoRef.current = { week: cw, year: cy }
    } else {
      if (existingCur) {
        if (loadGenRef.current !== gen) return
        setExistingReflection(existingCur)
        setPhase('already')
        setWeekLabel(formatWeekOfRangeLabel(now))
        return
      }
      if (!existingPrev) {
        isoRef.current = { week: pw, year: py }
      } else {
        isoRef.current = { week: cw, year: cy }
      }
    }

    const anchor = mondayOfIsoWeek(isoRef.current.year, isoRef.current.week)
    setWeekLabel(formatWeekOfRangeLabel(anchor))
    const { mon, sun } = localWeekMondaySundayYmd(anchor)
    const { startIso, endIso } = localWeekStartEndIso(anchor)

    const [totalMRes, doneMRes, habitsRes] = await Promise.all([
      supabase
        .from('daily_missions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('due_date', mon)
        .lte('due_date', sun)
        .not('due_date', 'is', null),
      supabase
        .from('daily_missions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', true)
        .gte('completed_at', startIso)
        .lte('completed_at', endIso)
        .not('completed_at', 'is', null),
      supabase
        .from('habit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('completed_at', startIso)
        .lte('completed_at', endIso),
    ])

    const userRes = userResEarly

    const missionsTotal = totalMRes.error ? 0 : (totalMRes.count ?? 0)
    const missionsCompleted = doneMRes.error ? 0 : (doneMRes.count ?? 0)
    const habitsCompleted = habitsRes.error ? 0 : (habitsRes.count ?? 0)
    const weeklyXp =
      typeof userRes.data?.weekly_xp === 'number' &&
      !Number.isNaN(userRes.data.weekly_xp)
        ? userRes.data.weekly_xp
        : 0
    const streak =
      typeof userRes.data?.current_streak === 'number' &&
      !Number.isNaN(userRes.data.current_streak)
        ? userRes.data.current_streak
        : 0

    const completionRate =
      missionsTotal <= 0
        ? 0
        : Math.min(100, Math.round((missionsCompleted / missionsTotal) * 100))

    const displayName =
      typeof (userRes.data as any)?.display_name === 'string'
        ? ((userRes.data as any).display_name as string)
        : ''
    const goalCategories = Array.isArray((userRes.data as any)?.goal_categories)
      ? (((userRes.data as any).goal_categories as unknown[]).filter(
          (x) => typeof x === 'string',
        ) as string[])
      : []
    const goalContextRaw = (userRes.data as any)?.goal_context
    const goalContext =
      goalContextRaw && typeof goalContextRaw === 'object' && !Array.isArray(goalContextRaw)
        ? (goalContextRaw as Record<string, any>)
        : {}
    if (loadGenRef.current !== gen) return
    setUserCtx({
      displayName: displayName?.trim() || '—',
      goalCategories,
      goalContext,
    })

    setWeekStats({
      missionsCompleted,
      missionsTotal,
      completionRate,
      habitsCompleted,
      weeklyXp,
      streak,
    })
    setPhase('form')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (phase !== 'loading') return
    const gen = loadGenRef.current
    const t = window.setTimeout(() => {
      if (loadGenRef.current !== gen) return
      setLoadError(
        'Taking longer than expected. Please check your connection and try again.',
      )
      setPhase('error')
    }, 10_000)
    return () => window.clearTimeout(t)
  }, [phase])

  async function handleSubmit() {
    if (!canSubmit || phase !== 'form') return

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) return

    const stats = weekStats

    setPhase('submitting')

    const rate = stats?.completionRate ?? null
    const { week: wk, year: yr } = isoRef.current

    const { data: inserted, error: insErr } = await supabase
      .from('reflections')
      .insert({
        user_id: user.id,
        week_number: wk,
        iso_week_year: yr,
        win_answer: win.trim(),
        miss_answer: miss.trim(),
        improve_answer: improve.trim(),
        xp_earned: 75,
        mission_completion_rate: rate,
      })
      .select('id')
      .single()

    if (insErr || !inserted?.id) {
      setLoadError(insErr?.message ?? 'Could not save reflection')
      setPhase('error')
      return
    }

    const reflectionId = inserted.id as string

    let newWeeklyXpAfter = 0
    try {
      const xpRes = await awardXP(user.id, 75, 'weekly_reflection')
      newWeeklyXpAfter = xpRes.newWeeklyXp
      enqueueXpToast(75)
    } catch (e) {
      await supabase.from('reflections').delete().eq('id', reflectionId)
      setLoadError(e instanceof Error ? e.message : 'Could not award XP')
      setPhase('error')
      return
    }

    // Reflection streak bonus: 3 consecutive ISO weeks
    try {
      const { data: last3, error: rErr } = await supabase
        .from('reflections')
        .select('week_number, iso_week_year')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3)
      if (!rErr && Array.isArray(last3) && last3.length === 3) {
        const a = last3[0] as any
        const b = last3[1] as any
        const c = last3[2] as any
        const w0 = typeof a.week_number === 'number' ? a.week_number : null
        const y0 = typeof a.iso_week_year === 'number' ? a.iso_week_year : null
        const w1 = typeof b.week_number === 'number' ? b.week_number : null
        const y1 = typeof b.iso_week_year === 'number' ? b.iso_week_year : null
        const w2 = typeof c.week_number === 'number' ? c.week_number : null
        const y2 = typeof c.iso_week_year === 'number' ? c.iso_week_year : null
        if (w0 && y0 && w1 && y1 && w2 && y2) {
          const p1 = previousIsoWeek(w0, y0)
          const p2 = previousIsoWeek(p1.week, p1.isoYear)
          const consecutive =
            w1 === p1.week &&
            y1 === p1.isoYear &&
            w2 === p2.week &&
            y2 === p2.isoYear
          if (consecutive) {
            const bonus = await awardXP(user.id, 50, 'reflection_streak')
            newWeeklyXpAfter = bonus.newWeeklyXp
            enqueueStreakToast('3-week reflection streak! +50 XP', REFLECTION_ACCENT)
          }
        }
      }
    } catch {
      // bonus is optional; ignore
    }

    const anchor = mondayOfIsoWeek(isoRef.current.year, isoRef.current.week)
    const { mon, sun } = localWeekMondaySundayYmd(anchor)

    const [moodWeekRes, sleepWeekRes] = await Promise.all([
      supabase
        .from('mood_logs')
        .select('mood_rating,energy_rating')
        .eq('user_id', user.id)
        .gte('log_date', mon)
        .lte('log_date', sun),
      supabase
        .from('sleep_logs')
        .select('rest_rating')
        .eq('user_id', user.id)
        .gte('log_date', mon)
        .lte('log_date', sun),
    ])

    if (moodWeekRes.error) {
      console.error('WeeklyReflection mood_logs:', moodWeekRes.error)
    }
    if (sleepWeekRes.error) {
      console.error('WeeklyReflection sleep_logs:', sleepWeekRes.error)
    }

    const avg = (xs: number[]): number | null => {
      if (!xs.length) return null
      return (
        Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
      )
    }

    const moodRows = (moodWeekRes.data ?? []) as {
      mood_rating?: unknown
      energy_rating?: unknown
    }[]
    const moodNums = moodRows
      .map((r) => r.mood_rating)
      .filter((x): x is number => typeof x === 'number' && x >= 1 && x <= 5)
    const energyNums = moodRows
      .map((r) => r.energy_rating)
      .filter((x): x is number => typeof x === 'number' && x >= 1 && x <= 5)
    const sleepRows = (sleepWeekRes.data ?? []) as { rest_rating?: unknown }[]
    const restNums = sleepRows
      .map((r) => r.rest_rating)
      .filter((x): x is number => typeof x === 'number' && x >= 1 && x <= 5)

    const wellness = {
      avgMoodThisWeek: avg(moodNums),
      avgEnergyThisWeek: avg(energyNums),
      avgRestThisWeek: avg(restNums),
    }

    let insight = ''
    try {
      insight = await weeklyReflectionCoachInsight(
        {
          completedMissions: stats?.missionsCompleted ?? 0,
          totalMissions: stats?.missionsTotal ?? 0,
          completionRate: stats?.completionRate ?? 0,
          streak: stats?.streak ?? 0,
          weeklyXp: newWeeklyXpAfter,
          habitsCompleted: stats?.habitsCompleted ?? 0,
        },
        {
          win: win.trim(),
          miss: miss.trim(),
          improve: improve.trim(),
        },
        userCtx ?? undefined,
        wellness,
      )
    } catch {
      insight =
        'We could not generate a coaching note right now. Your reflection is saved — check back later or try again next week.'
    }

    const { error: upErr } = await supabase
      .from('reflections')
      .update({ ai_insight: insight })
      .eq('id', reflectionId)
      .eq('user_id', user.id)

    if (upErr) {
      console.error('reflection ai_insight update failed', upErr)
    }

    setCompleteInsight(insight)
    setCompleteWeeklyXp(newWeeklyXpAfter)
    setPhase('complete')
  }

  const statsLineDisplay =
    weekStats &&
    `${weekStats.missionsCompleted}/${weekStats.missionsTotal} missions · ${weekStats.habitsCompleted} habits · ${weekStats.weeklyXp} XP · ${weekStats.streak} day streak`

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      {xpToast ? (
        xpToast.payload.kind === 'xp' ? (
          <XPToast
            key={xpToast.key}
            variant="xp"
            amount={xpToast.payload.amount}
            visible
            onHide={onXpToastHide}
          />
        ) : (
          <XPToast
            key={xpToast.key}
            variant="streak"
            message={xpToast.payload.message}
            accentColor={xpToast.payload.accentColor}
            visible
            onHide={onXpToastHide}
          />
        )
      ) : null}

      <header className="relative flex shrink-0 items-center justify-center border-b border-zinc-800/60 px-2 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to="/today"
          aria-label="Back to Today"
          className="absolute left-2 flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white"
        >
          <ChevronLeft size={20} aria-hidden strokeWidth={2} />
        </Link>
        <div className="max-w-[70%] text-center">
          <h1 className="text-lg font-bold text-white sm:text-xl">
            Weekly Reflection
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">{weekLabel}</p>
        </div>
      </header>

      {phase === 'loading' ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
          <p className="text-sm text-zinc-500">Loading…</p>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-4 py-12">
          <SectionLoadErrorCard
            sectionLabel="reflection"
            message={loadError ?? 'Something went wrong'}
            onRetry={() => void load()}
          />
          <Link
            to="/today"
            className="mt-4 text-xs font-semibold text-zinc-400 underline-offset-2 hover:underline"
          >
            Back to Today
          </Link>
        </div>
      ) : null}

      {phase === 'already' && existingReflection ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CompletionView
            heading="Already reflected this week"
            insight={
              existingReflection.ai_insight?.trim() || 'Insight unavailable'
            }
            showFreshXp={false}
            answers={{
              win: existingReflection.win_answer ?? '—',
              miss: existingReflection.miss_answer ?? '—',
              improve: existingReflection.improve_answer ?? '—',
            }}
            showComeBack
          />
        </div>
      ) : null}

      {phase === 'form' || phase === 'submitting' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-4">
          <div className="mx-auto max-w-lg">
            {statsLineDisplay ? (
              <div className="rounded-2xl border border-zinc-800/80 bg-app-surface px-4 py-3 ring-1 ring-zinc-800/40">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  This week
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-300">
                  {statsLineDisplay}
                </p>
              </div>
            ) : null}

            <div className="mt-8 space-y-8">
              <div>
                <label
                  htmlFor="refl-win"
                  className="text-base font-bold text-white"
                >
                  What was your biggest win this week?
                </label>
                <AutoGrowTextarea
                  id="refl-win"
                  value={win}
                  onChange={setWin}
                  disabled={phase === 'submitting'}
                  placeholder="Something you're proud of, no matter how small..."
                />
                <p className="mt-1 text-right text-xs text-zinc-500">
                  {win.length} / {MAX_CHARS}
                </p>
              </div>

              <div>
                <label
                  htmlFor="refl-miss"
                  className="text-base font-bold text-white"
                >
                  What did you fail at or avoid?
                </label>
                <AutoGrowTextarea
                  id="refl-miss"
                  value={miss}
                  onChange={setMiss}
                  disabled={phase === 'submitting'}
                  placeholder="Be honest. No judgment here."
                />
                <p className="mt-1 text-right text-xs text-zinc-500">
                  {miss.length} / {MAX_CHARS}
                </p>
              </div>

              <div>
                <label
                  htmlFor="refl-improve"
                  className="text-base font-bold text-white"
                >
                  What&apos;s the one thing you&apos;ll do differently next
                  week?
                </label>
                <AutoGrowTextarea
                  id="refl-improve"
                  value={improve}
                  onChange={setImprove}
                  disabled={phase === 'submitting'}
                  placeholder="One specific change, not a list..."
                />
                <p className="mt-1 text-right text-xs text-zinc-500">
                  {improve.length} / {MAX_CHARS}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={!canSubmit || phase === 'submitting'}
              onClick={() => void handleSubmit()}
              className="btn-press mt-10 w-full rounded-xl py-3.5 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
              style={{ backgroundColor: REFLECTION_ACCENT }}
            >
              {phase === 'submitting' ? 'Saving...' : 'Submit Reflection'}
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'complete' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-lg flex-col px-4 pb-12 pt-8">
            <div className="flex flex-col items-center">
              <svg
                width="92"
                height="92"
                viewBox="0 0 92 92"
                className="overflow-visible"
                aria-hidden
              >
                <circle
                  cx="46"
                  cy="46"
                  r="36"
                  fill="none"
                  stroke="rgba(34,197,94,0.25)"
                  strokeWidth="6"
                />
                <circle
                  cx="46"
                  cy="46"
                  r="36"
                  fill="none"
                  stroke="rgb(34,197,94)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  className="reflection-circle-draw"
                />
                <path
                  d="M30 47.5 L41 58.5 L62 36"
                  fill="none"
                  stroke="rgb(34,197,94)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="reflection-check-draw"
                />
              </svg>

              <p className="mt-6 text-2xl font-bold text-white">
                Week {isoRef.current.week} complete
              </p>
              <p className="mt-2 text-sm font-semibold text-amber-400">
                {completeWeeklyXp != null
                  ? `${completeWeeklyXp} XP earned this week`
                  : 'XP updated'}
              </p>
            </div>

            {weekStats ? (
              <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs font-semibold text-zinc-400">
                <span className="rounded-full border border-zinc-800/80 bg-zinc-900/40 px-3 py-1">
                  {weekStats.completionRate}% missions
                </span>
                <span className="rounded-full border border-zinc-800/80 bg-zinc-900/40 px-3 py-1">
                  {weekStats.habitsCompleted} habits
                </span>
                <span className="rounded-full border border-zinc-800/80 bg-zinc-900/40 px-3 py-1">
                  {weekStats.streak} day streak
                </span>
              </div>
            ) : null}

            <div
              className="mt-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-4 pl-5"
              style={{ borderLeftWidth: 4, borderLeftColor: REFLECTION_ACCENT }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Your coach says:
              </p>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-zinc-200">
                {completeInsight}
              </p>
            </div>

            <div className="mt-10 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => navigate('/today')}
                className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-opacity active:opacity-90"
                style={{ backgroundColor: REFLECTION_ACCENT }}
              >
                Back to Today
              </button>
              <button
                type="button"
                onClick={() => navigate('/progress')}
                className="w-full rounded-xl border border-zinc-800/80 bg-app-surface py-3.5 text-sm font-bold text-zinc-200 transition-colors hover:bg-zinc-900/60"
              >
                View Progress
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
