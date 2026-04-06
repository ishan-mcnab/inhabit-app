import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { XPToast } from '../components/XPToast'
import { useXpToastQueue } from '../hooks/useXpToastQueue'
import {
  formatWeekOfRangeLabel,
  getLocalISOWeek,
  getLocalISOWeekYear,
  localWeekMondaySundayYmd,
} from '../lib/isoWeek'
import { weeklyReflectionCoachInsight } from '../lib/openRouterSingle'
import { awardXP, localWeekStartEndIso } from '../lib/xp'
import { supabase } from '../supabase'

const REFLECTION_PURPLE = '#534AB7'
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
      className="min-h-[100px] w-full resize-none rounded-xl border border-zinc-800 bg-[#141418] px-3 py-2.5 text-sm text-white outline-none transition-[border-color,box-shadow] placeholder:text-zinc-600 focus:border-[#534AB7] focus:ring-2 focus:ring-[#534AB7]/35 disabled:opacity-60"
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
        style={{ borderLeftWidth: 4, borderLeftColor: REFLECTION_PURPLE }}
      >
        <p className="text-sm font-semibold leading-relaxed text-zinc-200">
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
        style={{ backgroundColor: REFLECTION_PURPLE }}
      >
        Back to Today
      </button>
    </div>
  )
}

export function WeeklyReflection() {
  const { toast: xpToast, enqueueXpToast, onXpToastHide } = useXpToastQueue()

  const [phase, setPhase] = useState<
    'loading' | 'form' | 'submitting' | 'complete' | 'already' | 'error'
  >('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null)
  const [existingReflection, setExistingReflection] =
    useState<ReflectionRow | null>(null)

  const [win, setWin] = useState('')
  const [miss, setMiss] = useState('')
  const [improve, setImprove] = useState('')
  const [completeInsight, setCompleteInsight] = useState('')

  const [weekLabel, setWeekLabel] = useState(() =>
    formatWeekOfRangeLabel(new Date()),
  )
  const isoRef = useRef({ week: getLocalISOWeek(new Date()), year: getLocalISOWeekYear(new Date()) })

  const canSubmit =
    win.trim().length >= MIN_SUBMIT &&
    miss.trim().length >= MIN_SUBMIT &&
    improve.trim().length >= MIN_SUBMIT

  const load = useCallback(async () => {
    setPhase('loading')
    setLoadError(null)

    const now = new Date()
    const isoWeek = getLocalISOWeek(now)
    const isoYear = getLocalISOWeekYear(now)
    isoRef.current = { week: isoWeek, year: isoYear }
    setWeekLabel(formatWeekOfRangeLabel(now))

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      setLoadError(authErr?.message ?? 'Not signed in')
      setPhase('error')
      return
    }

    const { data: existing, error: exErr } = await supabase
      .from('reflections')
      .select(
        'id,week_number,iso_week_year,win_answer,miss_answer,improve_answer,ai_insight,xp_earned,mission_completion_rate',
      )
      .eq('user_id', user.id)
      .eq('iso_week_year', isoYear)
      .eq('week_number', isoWeek)
      .maybeSingle()

    if (exErr) {
      setLoadError(exErr.message)
      setPhase('error')
      return
    }

    if (existing) {
      const row = existing as ReflectionRow
      setExistingReflection(row)
      setPhase('already')
      return
    }

    const { mon, sun } = localWeekMondaySundayYmd(now)
    const { startIso, endIso } = localWeekStartEndIso(now)

    const [
      totalMRes,
      doneMRes,
      habitsRes,
      userRes,
    ] = await Promise.all([
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
      supabase
        .from('users')
        .select('weekly_xp, current_streak')
        .eq('id', user.id)
        .maybeSingle(),
    ])

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

  async function handleSubmit() {
    if (!canSubmit || phase !== 'form') return

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) return

    const stats = weekStats
    const statsLine = stats
      ? `${stats.missionsCompleted} of ${stats.missionsTotal} missions completed (${stats.completionRate}% completion rate), ${stats.streak} day streak, ${stats.weeklyXp} XP earned this week.`
      : 'Stats unavailable.'

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

    try {
      await awardXP(user.id, 75, 'weekly_reflection')
      enqueueXpToast(75)
    } catch (e) {
      await supabase.from('reflections').delete().eq('id', reflectionId)
      setLoadError(e instanceof Error ? e.message : 'Could not award XP')
      setPhase('error')
      return
    }

    let insight = ''
    try {
      insight = await weeklyReflectionCoachInsight({
        statsLine,
        winAnswer: win.trim(),
        missAnswer: miss.trim(),
        improveAnswer: improve.trim(),
      })
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
          <p className="text-center text-sm text-red-400">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-bold text-app-bg"
          >
            Retry
          </button>
          <Link
            to="/today"
            className="mt-4 text-sm font-semibold text-zinc-400 underline-offset-2 hover:underline"
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
              existingReflection.ai_insight?.trim() ||
              'No coaching note was saved for this reflection.'
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
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-12 pt-4">
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
              className="mt-10 w-full rounded-xl py-3.5 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
              style={{ backgroundColor: REFLECTION_PURPLE }}
            >
              {phase === 'submitting' ? 'Saving...' : 'Submit Reflection'}
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'complete' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CompletionView
            insight={completeInsight}
            showFreshXp
            showComeBack={false}
          />
        </div>
      ) : null}
    </div>
  )
}
