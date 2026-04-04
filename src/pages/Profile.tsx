import { useCallback, useEffect, useState } from 'react'
import { RankShield } from '../components/RankShield'
import {
  calculateRank,
  checkAndResetWeeklyXp,
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
      setError(userError?.message ?? 'Not signed in')
      return
    }

    try {
      await checkAndResetWeeklyXp(user.id)
    } catch (e) {
      console.error('checkAndResetWeeklyXp (Profile) failed:', e)
    }

    const { data, error: qErr } = await supabase
      .from('users')
      .select(
        'quest_progression, weekly_xp, rank, total_xp, level, current_streak, longest_streak',
      )
      .eq('id', user.id)
      .maybeSingle()

    setLoading(false)

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
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
