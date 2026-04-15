import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { rankEmoji } from '../components/RankShield'
import { getGoalCategoryDisplay } from '../constants/goalCategoryPills'
import { getLocalISOWeek, localWeekMondaySundayYmd } from '../lib/isoWeek'
import {
  calculateRank,
  checkAndResetWeeklyXp,
  rankColor,
} from '../lib/xp'
import { supabase } from '../supabase'

const CARD_BG = '#0D0D0F'
const CARD_BORDER = '#2A2A2E'
const PURPLE = '#534AB7'
const CARD_GLOW = '0 0 40px rgba(83, 74, 183, 0.15)'
const BAR_TRACK = '#2A2A2E'

const CARD_MAX_W = 375

type HabitSnippet = {
  id: string
  title: string
  category: string | null
  current_streak: number
}

function buildShareText(params: {
  rank: string
  weeklyXp: number
  streak: number
}): string {
  const { rank, weeklyXp, streak } = params
  return `I'm a ${rank} on InHabit — ${weeklyXp.toLocaleString()} XP this week, ${streak} day streak. Building better habits every day. #InHabit #selfimprovement`
}

function weekBoundsIso(): { mon: string; sun: string; startIso: string; endIso: string } {
  const { mon, sun } = localWeekMondaySundayYmd(new Date())
  const start = new Date(`${mon}T00:00:00`)
  const end = new Date(`${sun}T23:59:59.999`)
  return {
    mon,
    sun,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

export function Share() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [level, setLevel] = useState(1)
  const [weeklyXp, setWeeklyXp] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [displayRank, setDisplayRank] = useState('Recruit')
  const [isoWeekNum, setIsoWeekNum] = useState(1)
  const [missionsDoneWeek, setMissionsDoneWeek] = useState(0)
  const [missionsTotalWeek, setMissionsTotalWeek] = useState(0)
  const [habits, setHabits] = useState<HabitSnippet[]>([])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }, [])

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
      console.error('checkAndResetWeeklyXp (Share) failed:', e)
    }

    const { mon, sun, startIso, endIso } = weekBoundsIso()
    setIsoWeekNum(getLocalISOWeek(new Date()))

    const [userRes, doneRes, totalRes, habitsRes] = await Promise.all([
      supabase
        .from('users')
        .select(
          'total_xp, level, weekly_xp, rank, current_streak, display_name',
        )
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('daily_missions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', true)
        .not('completed_at', 'is', null)
        .gte('completed_at', startIso)
        .lte('completed_at', endIso),
      supabase
        .from('daily_missions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('due_date', mon)
        .lte('due_date', sun),
      supabase
        .from('habits')
        .select('id, title, category, current_streak')
        .eq('user_id', user.id)
        .gt('current_streak', 0)
        .order('current_streak', { ascending: false })
        .limit(3),
    ])

    setLoading(false)

    if (userRes.error || !userRes.data) {
      setError(userRes.error?.message ?? 'No profile found')
      return
    }

    const row = userRes.data as Record<string, unknown>
    const wx =
      typeof row.weekly_xp === 'number' && !Number.isNaN(row.weekly_xp)
        ? Math.max(0, Math.floor(row.weekly_xp))
        : 0
    const lv =
      typeof row.level === 'number' && !Number.isNaN(row.level)
        ? Math.max(1, Math.floor(row.level))
        : 1
    const cs =
      typeof row.current_streak === 'number' && !Number.isNaN(row.current_streak)
        ? Math.max(0, Math.floor(row.current_streak))
        : 0

    setWeeklyXp(wx)
    setLevel(lv)
    setCurrentStreak(cs)
    setDisplayRank(calculateRank(wx))

    if (doneRes.error) {
      console.error('Share missions done count:', doneRes.error)
      setMissionsDoneWeek(0)
    } else {
      setMissionsDoneWeek(
        typeof doneRes.count === 'number' ? doneRes.count : 0,
      )
    }

    if (totalRes.error) {
      console.error('Share missions total count:', totalRes.error)
      setMissionsTotalWeek(0)
    } else {
      setMissionsTotalWeek(
        typeof totalRes.count === 'number' ? totalRes.count : 0,
      )
    }

    if (habitsRes.error) {
      console.error('Share habits:', habitsRes.error)
      setHabits([])
    } else {
      const rows = (habitsRes.data ?? []) as Record<string, unknown>[]
      setHabits(
        rows
          .map((r) => ({
            id: typeof r.id === 'string' ? r.id : '',
            title: typeof r.title === 'string' ? r.title : '',
            category: typeof r.category === 'string' ? r.category : null,
            current_streak:
              typeof r.current_streak === 'number' &&
              !Number.isNaN(r.current_streak)
                ? Math.max(0, Math.floor(r.current_streak))
                : 0,
          }))
          .filter(
            (h) => h.id !== '' && h.title !== '' && h.current_streak > 0,
          ),
      )
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rankHue = rankColor(displayRank)
  const completionPct =
    missionsTotalWeek <= 0
      ? 0
      : Math.min(
          100,
          Math.round((missionsDoneWeek / missionsTotalWeek) * 100),
        )

  const motivational =
    completionPct >= 80
      ? 'You crushed it this week. Let them know.'
      : completionPct >= 50
        ? 'Solid week. Keep building.'
        : 'Every week is a chance to improve. Share anyway.'

  const shareText = buildShareText({
    rank: displayRank,
    weeklyXp,
    streak: currentStreak,
  })

  const headerDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  async function copyStatsText() {
    try {
      await navigator.clipboard.writeText(shareText)
      showToast('Copied!')
    } catch (e) {
      console.error('clipboard:', e)
      showToast('Could not copy')
    }
  }

  async function screenshotAndShare() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText })
        return
      } catch (e: unknown) {
        const name =
          e && typeof e === 'object' && 'name' in e
            ? String((e as { name: unknown }).name)
            : ''
        if (name === 'AbortError') return
        console.warn('navigator.share failed:', e)
      }
    }
    try {
      await navigator.clipboard.writeText(shareText)
      showToast('Stats copied to clipboard!')
    } catch (e) {
      console.error('clipboard fallback:', e)
      showToast('Could not share or copy')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="relative shrink-0 border-b border-zinc-800/60 px-2 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="absolute left-2 top-[max(0.75rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800/80 hover:text-white"
          aria-label="Back to Profile"
        >
          <ChevronLeft size={20} aria-hidden strokeWidth={2} />
        </button>
        <div className="mx-auto max-w-[min(100%,24rem)] px-10 text-center">
          <h1 className="text-lg font-bold tracking-tight text-white">
            Share My Stats
          </h1>
          <p className="mt-1 text-xs font-medium leading-snug text-zinc-500">
            Show the world you&apos;re putting in the work
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-6">
        <div className="mx-auto flex w-full max-w-[375px] flex-col items-stretch">
          {error ? (
            <p className="text-center text-sm text-red-400">{error}</p>
          ) : null}

          {loading ? (
            <div
              className="mission-skeleton-shell w-full rounded-[16px] border border-zinc-800/80"
              style={{
                maxWidth: CARD_MAX_W,
                minHeight: 420,
                margin: '0 auto',
              }}
            />
          ) : !error ? (
            <>
              <article
                className="w-full overflow-hidden rounded-[16px] border p-6"
                style={{
                  maxWidth: CARD_MAX_W,
                  margin: '0 auto',
                  backgroundColor: CARD_BG,
                  borderColor: CARD_BORDER,
                  boxShadow: CARD_GLOW,
                }}
                aria-label="Shareable stats card"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">
                    InHabit
                  </span>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: PURPLE }}
                    aria-hidden
                  />
                  <span className="ml-auto text-xs font-medium text-zinc-500">
                    {headerDate}
                  </span>
                </div>

                <div className="mt-8 text-center">
                  <p
                    className="text-[42px] font-bold leading-none tracking-tight"
                    style={{ color: rankHue }}
                  >
                    {displayRank.toUpperCase()}
                  </p>
                  <p className="mt-3 text-[32px] leading-none" aria-hidden>
                    {rankEmoji(displayRank)}
                  </p>
                  <p className="mt-4 text-[13px] font-medium text-zinc-500">
                    Week {isoWeekNum} · Level {level}
                  </p>
                </div>

                <div
                  className="my-6 h-px w-full bg-zinc-800"
                  aria-hidden
                />

                <div className="grid grid-cols-3 items-start gap-1 text-center sm:gap-2">
                  <div>
                    <p className="text-[22px] font-bold tabular-nums text-white">
                      {currentStreak > 0
                        ? currentStreak.toLocaleString()
                        : '—'}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-zinc-500">
                      day streak
                      {currentStreak > 0 ? (
                        <span aria-hidden> {'\u{1F525}'}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="px-0.5">
                    {weeklyXp === 0 ? (
                      <p className="text-[26px] font-bold tabular-nums text-zinc-500">
                        0
                      </p>
                    ) : (
                      <p
                        className="text-[28px] font-bold tabular-nums leading-none"
                        style={{ color: PURPLE }}
                      >
                        {weeklyXp.toLocaleString()}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] font-medium text-zinc-500">
                      XP this week
                    </p>
                  </div>
                  <div>
                    <p className="text-[22px] font-bold tabular-nums text-white">
                      {missionsDoneWeek.toLocaleString()}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-zinc-500">
                      missions done
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                      Weekly completion
                    </span>
                    <span className="text-[11px] font-bold tabular-nums text-zinc-400">
                      {completionPct}%
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: BAR_TRACK }}
                    role="progressbar"
                    aria-valuenow={completionPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${completionPct}%`,
                        backgroundColor: PURPLE,
                      }}
                    />
                  </div>
                </div>

                {habits.length > 0 ? (
                  <div className="mt-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                      Habit streaks
                    </p>
                    <p className="mt-2 text-center text-[12px] font-semibold leading-relaxed text-zinc-300">
                      {habits.map((h, i) => {
                        const { emoji } = getGoalCategoryDisplay(h.category)
                        return (
                          <span key={h.id}>
                            {i > 0 ? (
                              <span className="text-zinc-600"> · </span>
                            ) : null}
                            <span aria-hidden>{emoji} </span>
                            {h.title}{' '}
                            <span className="whitespace-nowrap">
                              {'\u{1F525}'}
                              {h.current_streak}
                            </span>
                          </span>
                        )
                      })}
                    </p>
                  </div>
                ) : null}

                <p className="mt-8 text-center text-[10px] font-medium text-zinc-600">
                  Built with InHabit
                </p>
              </article>

              <p className="mx-auto mt-5 max-w-[340px] text-center text-[13px] font-medium italic leading-snug text-zinc-500">
                {motivational}
              </p>

              <div className="mt-6 flex w-full flex-col gap-3">
                <button
                  type="button"
                  onClick={() => void screenshotAndShare()}
                  className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-opacity active:opacity-90"
                  style={{ backgroundColor: PURPLE }}
                >
                  Screenshot &amp; Share
                </button>
                <button
                  type="button"
                  onClick={() => void copyStatsText()}
                  className="w-full rounded-xl border border-zinc-800/80 py-3.5 text-sm font-bold text-white transition-colors hover:border-zinc-700"
                  style={{ backgroundColor: '#141418' }}
                >
                  Copy Stats Text
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div
          className="pointer-events-none fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-[200] max-w-[90vw] -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}
