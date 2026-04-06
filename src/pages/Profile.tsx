import { useCallback, useEffect, useState } from 'react'
import { RankShield } from '../components/RankShield'
import { getGoalCategoryDisplay } from '../constants/goalCategoryPills'
import { streakTierTextStyle } from '../lib/streakTierStyle'
import {
  calculateRank,
  checkAndResetWeeklyXp,
  formatXpLogReason,
  getWeeklyRankBandProgress,
  rankColor,
} from '../lib/xp'
import { supabase } from '../supabase'

const GOAL_PURPLE = '#534AB7'
const CARD_BG = '#141418'
const BAR_TRACK = '#2A2A2E'

type QuestProgressionMode = 'weekly' | 'completion'

type UserStats = {
  weekly_xp: number
  rank: string
  total_xp: number
  level: number
  current_streak: number
  longest_streak: number
}

type XpLogEntry = {
  id: string
  amount: number
  reason: string
  created_at: string
}

type HabitStreakRow = {
  id: string
  title: string
  category: string | null
  current_streak: number
}

function formatRelativeXpTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const now = Date.now()
  const diffMs = Math.max(0, now - t)
  const sec = Math.floor(diffMs / 1000)
  if (sec < 45) return 'Just now'
  const min = Math.floor(sec / 60)
  if (min < 60) {
    return `${min} minute${min === 1 ? '' : 's'} ago`
  }
  const hr = Math.floor(min / 60)
  if (hr < 24) {
    return `${hr} hour${hr === 1 ? '' : 's'} ago`
  }
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  if (t >= startOfYesterday.getTime() && t < startOfToday.getTime()) {
    return 'Yesterday'
  }
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function parseUserStats(d: Record<string, unknown>): UserStats {
  return {
    weekly_xp:
      typeof d.weekly_xp === 'number' && !Number.isNaN(d.weekly_xp)
        ? Math.max(0, Math.floor(d.weekly_xp))
        : 0,
    rank:
      typeof d.rank === 'string' && d.rank.trim() ? d.rank.trim() : 'Recruit',
    total_xp:
      typeof d.total_xp === 'number' && !Number.isNaN(d.total_xp)
        ? Math.max(0, Math.floor(d.total_xp))
        : 0,
    level:
      typeof d.level === 'number' && !Number.isNaN(d.level)
        ? Math.max(1, Math.floor(d.level))
        : 1,
    current_streak:
      typeof d.current_streak === 'number' && !Number.isNaN(d.current_streak)
        ? Math.max(0, Math.floor(d.current_streak))
        : 0,
    longest_streak:
      typeof d.longest_streak === 'number' && !Number.isNaN(d.longest_streak)
        ? Math.max(0, Math.floor(d.longest_streak))
        : 0,
  }
}

export function Profile() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<QuestProgressionMode>('weekly')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [xpLogs, setXpLogs] = useState<XpLogEntry[]>([])
  const [habitStreaks, setHabitStreaks] = useState<HabitStreakRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoading(false)
      setStats(null)
      setXpLogs([])
      setHabitStreaks([])
      setError(userError?.message ?? 'Not signed in')
      return
    }

    try {
      await checkAndResetWeeklyXp(user.id)
    } catch (e) {
      console.error('checkAndResetWeeklyXp (Profile) failed:', e)
    }

    const [{ data, error: qErr }, logsRes, habitsRes] = await Promise.all([
      supabase
        .from('users')
        .select(
          'quest_progression, weekly_xp, rank, total_xp, level, current_streak, longest_streak',
        )
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('xp_logs')
        .select('id, amount, reason, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('habits')
        .select('id,title,category,current_streak')
        .eq('user_id', user.id),
    ])

    setLoading(false)

    if (habitsRes.error) {
      console.error('habits load (profile) failed:', habitsRes.error)
      setHabitStreaks([])
    } else {
      const rows = (habitsRes.data ?? []) as Record<string, unknown>[]
      const parsed: HabitStreakRow[] = rows
        .map((r) => ({
          id: typeof r.id === 'string' ? r.id : '',
          title: typeof r.title === 'string' ? r.title : '',
          category: typeof r.category === 'string' ? r.category : null,
          current_streak:
            typeof r.current_streak === 'number' && !Number.isNaN(r.current_streak)
              ? Math.max(0, Math.floor(r.current_streak))
              : 0,
        }))
        .filter((r) => r.id !== '' && r.title !== '' && r.current_streak > 0)
        .sort((a, b) => b.current_streak - a.current_streak)
      setHabitStreaks(parsed)
    }

    if (logsRes.error) {
      console.error('xp_logs load failed:', logsRes.error)
      setXpLogs([])
    } else {
      const rows = (logsRes.data ?? []) as Record<string, unknown>[]
      setXpLogs(
        rows
          .map((r) => ({
            id: typeof r.id === 'string' ? r.id : '',
            amount:
              typeof r.amount === 'number' && !Number.isNaN(r.amount)
                ? Math.trunc(r.amount)
                : 0,
            reason: typeof r.reason === 'string' ? r.reason : '',
            created_at:
              typeof r.created_at === 'string' ? r.created_at : '',
          }))
          .filter((r) => r.id !== '' && r.created_at !== ''),
      )
    }

    if (qErr) {
      setError(qErr.message)
      setStats(null)
      return
    }

    if (!data) {
      setError('No profile found')
      setStats(null)
      return
    }

    const row = data as Record<string, unknown>
    const raw = row.quest_progression
    setMode(raw === 'completion' ? 'completion' : 'weekly')
    setStats(parseUserStats(row))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function updateMode(next: QuestProgressionMode) {
    setError(null)
    const prev = mode
    setMode(next)
    setSaving(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setSaving(false)
      setMode(prev)
      setError(userError?.message ?? 'Not signed in')
      return
    }

    const { error: uErr } = await supabase
      .from('users')
      .update({ quest_progression: next })
      .eq('id', user.id)

    setSaving(false)

    if (uErr) {
      setMode(prev)
      setError(uErr.message)
      return
    }

    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 2000)
  }

  const displayRank =
    stats !== null ? calculateRank(stats.weekly_xp) : 'Recruit'
  const rankHue = rankColor(displayRank)
  const weeklyBand = stats
    ? getWeeklyRankBandProgress(stats.weekly_xp)
    : { kind: 'legend' as const }
  const weeklyBarPct =
    weeklyBand.kind === 'legend' ? 100 : weeklyBand.percent

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="shrink-0 border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Profile
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-6">
        <div className="mx-auto max-w-lg space-y-8">
          {loading ? (
            <p className="text-sm font-medium text-zinc-500">Loading…</p>
          ) : error ? (
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
          ) : stats ? (
            <>
              <section aria-labelledby="profile-rank-heading">
                <h2
                  id="profile-rank-heading"
                  className="text-sm font-bold uppercase tracking-wider text-zinc-500"
                >
                  Weekly rank
                </h2>
                <div
                  className="mt-4 rounded-2xl border border-zinc-800/80 p-5 shadow-lg ring-1 ring-zinc-800/30"
                  style={{ backgroundColor: CARD_BG }}
                >
                  <div className="flex flex-col items-center text-center">
                    <RankShield rankName={displayRank} accentColor={rankHue} />
                    <p className="mt-3 text-sm font-medium text-zinc-500">
                      {stats.weekly_xp.toLocaleString()} XP this week
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
                        className="h-2.5 w-full overflow-hidden rounded-full"
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
                </div>
              </section>

              <section aria-labelledby="profile-stats-heading">
                <h2
                  id="profile-stats-heading"
                  className="text-sm font-bold uppercase tracking-wider text-zinc-500"
                >
                  Stats
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total XP', value: stats.total_xp.toLocaleString() },
                    { label: 'Level', value: String(stats.level) },
                    {
                      label: 'Current streak',
                      value: `${stats.current_streak} days`,
                    },
                    {
                      label: 'Longest streak',
                      value: `${stats.longest_streak} days`,
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl border border-zinc-800/80 bg-app-surface px-4 py-3 ring-1 ring-zinc-800/25"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                        {s.label}
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-white">
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section aria-labelledby="profile-habit-streaks-heading">
                <h2
                  id="profile-habit-streaks-heading"
                  className="text-sm font-bold uppercase tracking-wider text-zinc-500"
                >
                  Habit Streaks
                </h2>
                {habitStreaks.length === 0 ? (
                  <p className="mt-3 text-sm font-medium leading-relaxed text-zinc-500">
                    No habits yet — add habits on the Today tab
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {habitStreaks.map((h) => {
                      const cat = getGoalCategoryDisplay(h.category)
                      return (
                        <li
                          key={h.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-app-surface px-4 py-3 ring-1 ring-zinc-800/25"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-white">
                              <span aria-hidden>{cat.emoji} </span>
                              {h.title}
                            </p>
                          </div>
                          <p
                            className="shrink-0 text-sm font-bold tabular-nums"
                            style={streakTierTextStyle(h.current_streak)}
                          >
                            🔥 {h.current_streak}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section aria-labelledby="profile-prefs-heading">
                <h2
                  id="profile-prefs-heading"
                  className="text-sm font-bold uppercase tracking-wider text-zinc-500"
                >
                  Goal preferences
                </h2>
                <div
                  className="mt-4 rounded-2xl border border-zinc-800/80 bg-app-surface p-4"
                  style={{
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-bold text-white">
                      Quest progression
                    </span>
                    <span className="text-sm font-medium text-zinc-500">
                      How your weekly quests unlock
                    </span>
                  </div>

                  <div
                    className="mt-4 flex rounded-xl border border-zinc-800 p-1"
                    role="group"
                    aria-label="Quest progression mode"
                  >
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void updateMode('weekly')}
                      className={[
                        'flex-1 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors',
                        mode === 'weekly'
                          ? 'text-white'
                          : 'text-zinc-500 hover:text-zinc-300',
                      ].join(' ')}
                      style={
                        mode === 'weekly'
                          ? {
                              backgroundColor: 'rgba(83, 74, 183, 0.22)',
                              boxShadow: `inset 0 0 0 1px ${GOAL_PURPLE}55`,
                            }
                          : undefined
                      }
                    >
                      <span className="block">Weekly</span>
                      <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-zinc-500">
                        Quests unlock each week on schedule
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void updateMode('completion')}
                      className={[
                        'flex-1 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors',
                        mode === 'completion'
                          ? 'text-white'
                          : 'text-zinc-500 hover:text-zinc-300',
                      ].join(' ')}
                      style={
                        mode === 'completion'
                          ? {
                              backgroundColor: 'rgba(83, 74, 183, 0.22)',
                              boxShadow: `inset 0 0 0 1px ${GOAL_PURPLE}55`,
                            }
                          : undefined
                      }
                    >
                      <span className="block">On Completion</span>
                      <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-zinc-500">
                        Quests unlock when you finish the previous one
                      </span>
                    </button>
                  </div>
                </div>

                {savedFlash ? (
                  <p
                    className="mt-3 text-center text-sm font-semibold text-emerald-400"
                    role="status"
                  >
                    Saved
                  </p>
                ) : saving ? (
                  <p className="mt-3 text-center text-xs font-medium text-zinc-500">
                    Saving…
                  </p>
                ) : null}
              </section>

              <section
                className="border-t border-zinc-800/60 pt-8"
                aria-labelledby="profile-xp-log-heading"
              >
                <h2
                  id="profile-xp-log-heading"
                  className="text-sm font-bold uppercase tracking-wider text-zinc-500"
                >
                  Recent XP Activity
                </h2>
                {xpLogs.length === 0 ? (
                  <p className="mt-3 text-sm font-medium leading-relaxed text-zinc-500">
                    No XP earned yet — complete missions to get started
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {xpLogs.map((row) => {
                      const pos = row.amount > 0
                      const amtLabel = pos
                        ? `+${row.amount} XP`
                        : `${row.amount} XP`
                      return (
                        <li
                          key={row.id}
                          className="flex flex-col gap-0.5 rounded-lg border border-zinc-800/50 bg-app-surface/40 px-3 py-2.5 ring-1 ring-zinc-800/20"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span
                              className={[
                                'text-sm font-bold tabular-nums',
                                pos ? 'text-emerald-500' : 'text-red-400',
                              ].join(' ')}
                            >
                              {amtLabel}
                            </span>
                            <span className="shrink-0 text-[11px] font-medium text-zinc-600">
                              {formatRelativeXpTime(row.created_at)}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-zinc-500">
                            {formatXpLogReason(row.reason)}
                          </p>
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
