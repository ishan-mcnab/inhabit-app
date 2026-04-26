import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useCountUp } from '../hooks/useCountUp'
import { ChevronRight, Clock } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RankShield } from '../components/RankShield'
import { SectionLoadErrorCard } from '../components/SectionLoadErrorCard'
import { useNotificationPrefs } from '../hooks/useNotificationPrefs'
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
const CARD_BORDER = 'rgba(255,255,255,0.08)'
const MUTED_BODY = '#888780'
const MUTED_VERY = 'rgba(136, 135, 128, 0.65)'
const BAR_TRACK = '#2A2A2E'

const SECTION_HEAD_CLASS =
  'shrink-0 text-[10px] font-medium uppercase tracking-[0.08em]'

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

const STAT_PURPLE = '#534AB7'
const STAT_AMBER = '#F59E0B'
const STAT_ORANGE = '#FF6B35'
const STAT_ORANGE_MUTED = 'rgba(255, 107, 53, 0.45)'
const STAT_GREEN = '#34D399'
const STAT_GREEN_MUTED = 'rgba(52, 211, 153, 0.45)'
const SIGN_OUT_RED = '#E24B4A'

const STREAK_MILESTONES = [7, 14, 21, 30, 60, 100] as const

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

function initialsFromDisplayName(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
  return (
    parts[0]!.slice(0, 1) + parts[parts.length - 1]!.slice(0, 1)
  ).toUpperCase()
}

function formatMemberSince(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function nextStreakMilestone(streak: number): number {
  const s = Math.max(0, Math.floor(streak))
  for (const m of STREAK_MILESTONES) {
    if (s < m) return m
  }
  return 100
}

function streakMilestonePercent(streak: number): number {
  const s = Math.max(0, Math.floor(streak))
  if (s >= 100) return 100
  const next = nextStreakMilestone(s)
  return Math.min(100, (s / next) * 100)
}

function streakMilestoneBarColor(streak: number): string {
  const n = Math.max(0, Math.floor(streak))
  if (n <= 6) return '#ffffff'
  if (n <= 13) return '#FF6B35'
  if (n <= 20) return '#EF9F27'
  return '#534AB7'
}

function NotificationToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="mt-0.5 text-xs font-medium leading-snug text-zinc-500">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative h-8 w-[3.25rem] shrink-0 rounded-full transition-colors',
          checked ? 'bg-[#534AB7]' : 'bg-zinc-700',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform',
            checked ? 'left-[calc(100%-1.75rem)]' : 'left-1',
          ].join(' ')}
          aria-hidden
        />
      </button>
    </div>
  )
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
      className="card-sheen rounded-xl border border-l-[3px] px-4 py-3 transition-colors hover:bg-white/[0.04]"
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

function StatCardCount({
  accent,
  label,
  valueNum,
  sub,
}: {
  accent: string
  label: string
  valueNum: number
  sub?: string | null
}) {
  const v = useCountUp(valueNum)
  return (
    <StatCard
      accent={accent}
      label={label}
      value={v.toLocaleString()}
      sub={sub}
    />
  )
}

export function Profile() {
  const navigate = useNavigate()
  const location = useLocation()
  const [notificationPrefs, setNotificationPrefsPatch] = useNotificationPrefs()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadStallMessage, setLoadStallMessage] = useState<string | null>(null)
  const [habitsSectionError, setHabitsSectionError] = useState<string | null>(
    null,
  )
  const [xpLogsSectionError, setXpLogsSectionError] = useState<string | null>(
    null,
  )
  const [statsCountsError, setStatsCountsError] = useState<string | null>(
    null,
  )
  const [mode, setMode] = useState<QuestProgressionMode>('weekly')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [xpLogs, setXpLogs] = useState<XpLogEntry[]>([])
  const [habitStreaks, setHabitStreaks] = useState<HabitStreakRow[]>([])
  const [displayName, setDisplayName] = useState('')
  const [memberSinceLabel, setMemberSinceLabel] = useState('')
  const [goalsCompleted, setGoalsCompleted] = useState<number | null>(null)
  const [missionsCompleted, setMissionsCompleted] = useState<number | null>(
    null,
  )

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false)

  const nameBlockRef = useRef<HTMLDivElement>(null)
  const loadGenRef = useRef(0)
  const lastFetchedAtRef = useRef<number | null>(null)

  const TAB_REFRESH_STALE_MS = 30_000

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent)
    const gen = ++loadGenRef.current
    if (!silent) {
      setLoading(true)
      setError(null)
      setLoadStallMessage(null)
    }
    setHabitsSectionError(null)
    setXpLogsSectionError(null)
    setStatsCountsError(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      if (loadGenRef.current !== gen) return
      if (!silent) setLoading(false)
      setStats(null)
      setXpLogs([])
      setHabitStreaks([])
      setGoalsCompleted(null)
      setMissionsCompleted(null)
      setDisplayName('')
      setMemberSinceLabel('')
      setError(userError?.message ?? 'Not signed in')
      return
    }

    setMemberSinceLabel(formatMemberSince(user.created_at))

    try {
      await checkAndResetWeeklyXp(user.id)
    } catch (e) {
      console.error('checkAndResetWeeklyXp (Profile) failed:', e)
    }

    const [
      { data, error: qErr },
      logsRes,
      habitsRes,
      goalsCountRes,
      missionsCountRes,
    ] = await Promise.all([
      supabase
        .from('users')
        .select(
          'display_name, quest_progression, weekly_xp, rank, total_xp, level, current_streak, longest_streak',
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
      supabase
        .from('goals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'completed'),
      supabase
        .from('daily_missions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', true),
    ])

    if (loadGenRef.current !== gen) return

    if (!silent) setLoading(false)

    if (habitsRes.error) {
      console.error('habits load (profile) failed:', habitsRes.error)
      setHabitsSectionError(habitsRes.error.message)
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
      setXpLogsSectionError(logsRes.error.message)
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

    if (goalsCountRes.error || missionsCountRes.error) {
      if (goalsCountRes.error) {
        console.error('goals completed count failed:', goalsCountRes.error)
      }
      if (missionsCountRes.error) {
        console.error('missions completed count failed:', missionsCountRes.error)
      }
      setStatsCountsError(
        goalsCountRes.error?.message ??
          missionsCountRes.error?.message ??
          'Could not load completion stats',
      )
      setGoalsCompleted(null)
      setMissionsCompleted(null)
    } else {
      setGoalsCompleted(
        typeof goalsCountRes.count === 'number' ? goalsCountRes.count : 0,
      )
      setMissionsCompleted(
        typeof missionsCountRes.count === 'number'
          ? missionsCountRes.count
          : 0,
      )
    }

    if (qErr) {
      if (loadGenRef.current !== gen) return
      setError(qErr.message)
      setStats(null)
      return
    }

    if (!data) {
      if (loadGenRef.current !== gen) return
      setError('No profile found')
      setStats(null)
      return
    }

    if (loadGenRef.current !== gen) return

    const row = data as Record<string, unknown>
    const raw = row.quest_progression
    setMode(raw === 'completion' ? 'completion' : 'weekly')
    setStats(parseUserStats(row))

    const dn =
      typeof row.display_name === 'string' ? row.display_name.trim() : ''
    const fallback =
      typeof user.email === 'string' && user.email.includes('@')
        ? user.email.split('@')[0]!
        : 'User'
    setDisplayName(dn || fallback)
    lastFetchedAtRef.current = Date.now()
  }, [])

  const maybeRefreshProfile = useCallback(() => {
    const t = lastFetchedAtRef.current
    if (t !== null && Date.now() - t < TAB_REFRESH_STALE_MS) return
    const silent = t !== null
    void load({ silent })
  }, [load])

  useEffect(() => {
    if (location.pathname !== '/profile') return
    void maybeRefreshProfile()
  }, [location.pathname, maybeRefreshProfile])

  useEffect(() => {
    if (!loading) return
    const gen = loadGenRef.current
    const t = window.setTimeout(() => {
      if (loadGenRef.current !== gen) return
      setLoadStallMessage(
        'Taking longer than expected. Please check your connection and try again.',
      )
      setLoading(false)
    }, 10_000)
    return () => window.clearTimeout(t)
  }, [loading])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (location.pathname !== '/profile') return
      void maybeRefreshProfile()
    }
    const onWindowFocus = () => {
      if (location.pathname !== '/profile') return
      void maybeRefreshProfile()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onWindowFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onWindowFocus)
    }
  }, [maybeRefreshProfile, location.pathname])

  function beginEditName() {
    setNameError(null)
    setNameDraft(displayName)
    setEditingName(true)
    requestAnimationFrame(() => {
      nameBlockRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function cancelEditName() {
    setEditingName(false)
    setNameDraft('')
    setNameError(null)
  }

  async function saveDisplayName() {
    setNameError(null)
    const next = nameDraft.trim()
    if (!next) {
      setNameError('Name cannot be empty')
      return
    }

    setNameSaving(true)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      setNameSaving(false)
      setNameError(userError?.message ?? 'Not signed in')
      return
    }

    const { error: uErr } = await supabase
      .from('users')
      .update({ display_name: next })
      .eq('id', user.id)

    setNameSaving(false)

    if (uErr) {
      setNameError(uErr.message)
      return
    }

    setDisplayName(next)
    setEditingName(false)
    setNameDraft('')
  }

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

  async function confirmSignOut() {
    setSignOutConfirmOpen(false)
    setStats(null)
    setXpLogs([])
    setHabitStreaks([])
    setDisplayName('')
    setGoalsCompleted(null)
    setMissionsCompleted(null)
    setEditingName(false)
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const displayRank =
    stats !== null ? calculateRank(stats.weekly_xp) : 'Recruit'
  const rankHue = rankColor(displayRank)
  const weeklyBand = stats
    ? getWeeklyRankBandProgress(stats.weekly_xp)
    : { kind: 'legend' as const }
  const weeklyBarPct =
    weeklyBand.kind === 'legend' ? 100 : weeklyBand.percent

  const avatarInitials = initialsFromDisplayName(displayName)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app-bg px-4 pb-28">
      <header className="shrink-0 border-b border-zinc-800/60 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Profile
        </h1>
      </header>

      <div className="mx-auto w-full max-w-lg space-y-6 pb-6 pt-0">
          {loading ? (
            <div className="space-y-6 pb-8">
              <div className="flex flex-col items-center pt-8">
                <div className="mission-skeleton-shell size-20 shrink-0 rounded-full" />
                <div className="mission-skeleton-shell mt-4 h-6 w-40 rounded-lg" />
                <div className="mission-skeleton-shell mt-2 h-4 w-32 rounded-md" />
              </div>
              <div className="text-center">
                <div className="mx-auto h-[140px] max-w-[120px] rounded-xl mission-skeleton-shell" />
                <div className="mx-auto mt-4 h-4 w-48 rounded-md mission-skeleton-shell" />
                <div className="mx-auto mt-3 h-3 w-full max-w-xs rounded-md mission-skeleton-shell" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="mission-skeleton-shell h-[92px] rounded-xl border border-zinc-800/60"
                    style={{ backgroundColor: CARD_BG }}
                  />
                ))}
              </div>
            </div>
          ) : error || loadStallMessage ? (
            <div className="py-8">
              <SectionLoadErrorCard
                sectionLabel="your profile"
                message={loadStallMessage ?? error ?? 'Something went wrong'}
                onRetry={() => void load()}
              />
            </div>
          ) : stats ? (
            <>
              <section
                ref={nameBlockRef}
                className="flex flex-col items-center pt-8 text-center"
                aria-label="Profile header"
              >
                <div
                  className="flex size-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white ring-2 ring-purple-600/30"
                  style={{ backgroundColor: GOAL_PURPLE }}
                  aria-hidden
                >
                  {avatarInitials}
                </div>

                {!editingName ? (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <p className="text-[20px] font-semibold text-white">
                      {displayName}
                    </p>
                    <button
                      type="button"
                      onClick={beginEditName}
                      className="text-xs font-semibold text-[#534AB7] underline-offset-2 hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 w-full max-w-sm px-1">
                    <label className="sr-only" htmlFor="profile-display-name">
                      Display name
                    </label>
                    <input
                      id="profile-display-name"
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="w-full rounded-xl border border-zinc-700 bg-app-surface px-4 py-3 text-base font-semibold text-white outline-none ring-app-accent/0 focus-visible:ring-2"
                      autoComplete="name"
                      disabled={nameSaving}
                    />
                    {nameError ? (
                      <p className="mt-2 text-left text-xs font-medium text-red-400">
                        {nameError}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        disabled={nameSaving}
                        onClick={() => void saveDisplayName()}
                        className="rounded-xl bg-[#534AB7] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {nameSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        disabled={nameSaving}
                        onClick={cancelEditName}
                        className="text-sm font-bold text-zinc-500 underline-offset-2 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {memberSinceLabel ? (
                  <p
                    className="mt-1 text-xs font-medium"
                    style={{ color: MUTED_BODY }}
                  >
                    Member since {memberSinceLabel}
                  </p>
                ) : null}
                <div
                  className="mt-6 w-full border-b"
                  style={{ borderColor: CARD_BORDER }}
                  aria-hidden
                />
              </section>

              <section className="text-center" aria-label="Weekly rank">
                <div className="pt-6 pb-5" data-tutorial="rank-shield-profile">
                  <RankShield rankName={displayRank} accentColor={rankHue} />
                  <p
                    className="mt-3 text-[14px] font-medium leading-snug"
                    style={{ color: MUTED_BODY }}
                  >
                    {stats.weekly_xp.toLocaleString()} XP this week ·{' '}
                    {displayRank} rank
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
              </section>

              <section aria-labelledby="profile-stats-heading">
                <div id="profile-stats-heading" className="sr-only">
                  Stats
                </div>
                <SectionHeadingRow>Stats</SectionHeadingRow>
                {statsCountsError ? (
                  <div className="mt-4">
                    <SectionLoadErrorCard
                      sectionLabel="goals and missions counts"
                      message={statsCountsError}
                      onRetry={() => void load()}
                    />
                  </div>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-3" data-tutorial="stats-grid">
                  <StatCardCount
                    accent={STAT_PURPLE}
                    label="Total XP"
                    valueNum={stats.total_xp}
                  />
                  <StatCardCount
                    accent={STAT_AMBER}
                    label="Current Level"
                    valueNum={stats.level}
                  />
                  <StatCard
                    accent={STAT_ORANGE}
                    label="Current Streak"
                    value={String(stats.current_streak)}
                  />
                  <StatCard
                    accent={STAT_ORANGE_MUTED}
                    label="Longest Streak"
                    value={String(stats.longest_streak)}
                  />
                  <StatCard
                    accent={STAT_GREEN}
                    label="Goals Completed"
                    value={
                      goalsCompleted == null
                        ? '—'
                        : goalsCompleted.toLocaleString()
                    }
                  />
                  <StatCard
                    accent={STAT_GREEN_MUTED}
                    label="Missions Completed"
                    value={
                      missionsCompleted == null
                        ? '—'
                        : missionsCompleted.toLocaleString()
                    }
                  />
                </div>
              </section>

              <section aria-labelledby="profile-habit-streaks-heading">
                <div id="profile-habit-streaks-heading" className="sr-only">
                  Habit streaks
                </div>
                <SectionHeadingRow>Habit streaks</SectionHeadingRow>
                {habitsSectionError ? (
                  <div className="mt-3">
                    <SectionLoadErrorCard
                      sectionLabel="habit streaks"
                      message={habitsSectionError}
                      onRetry={() => void load()}
                    />
                  </div>
                ) : habitStreaks.length === 0 ? (
                  <p
                    className="mt-3 text-sm font-medium leading-relaxed"
                    style={{ color: MUTED_BODY }}
                  >
                    No active habit streaks yet
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {habitStreaks.map((h) => {
                      const cat = getGoalCategoryDisplay(h.category)
                      const nextM = nextStreakMilestone(h.current_streak)
                      const pct = streakMilestonePercent(h.current_streak)
                      const barColor = streakMilestoneBarColor(h.current_streak)
                      const daysLeft = Math.max(0, nextM - h.current_streak)
                      const milestoneLabel =
                        daysLeft === 1
                          ? `1 day to ${nextM}-day milestone`
                          : `${daysLeft} days to ${nextM}-day milestone`
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
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-white">
                                <span aria-hidden>{cat.emoji} </span>
                                {h.title}
                              </p>
                            </div>
                            <p
                              className="shrink-0 text-sm font-bold tabular-nums"
                              style={streakTierTextStyle(h.current_streak)}
                            >
                              <span aria-hidden>{'\u{1F525}'} </span>
                              {h.current_streak}
                            </p>
                          </div>
                          <div className="mt-2.5">
                            {h.current_streak >= 100 ? (
                              <p className="text-center text-[11px] font-semibold text-[#534AB7]">
                                Legend streak{' '}
                                <span aria-hidden>🔥</span>
                              </p>
                            ) : (
                              <>
                                <div
                                  className="h-1 w-full overflow-hidden rounded-full"
                                  style={{ backgroundColor: BAR_TRACK }}
                                  role="progressbar"
                                  aria-valuenow={Math.round(pct)}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-label="Streak milestone progress"
                                >
                                  <div
                                    className="h-full rounded-full transition-[width] duration-300"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: barColor,
                                    }}
                                  />
                                </div>
                                <p
                                  className="mt-2 text-[11px] font-medium"
                                  style={{ color: MUTED_VERY }}
                                >
                                  {milestoneLabel}
                                </p>
                              </>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section aria-labelledby="profile-prefs-heading">
                <div id="profile-prefs-heading" className="sr-only">
                  Goal preferences
                </div>
                <SectionHeadingRow>Goal preferences</SectionHeadingRow>
                <div
                  className="mt-4 rounded-2xl border p-4"
                  style={{
                    backgroundColor: CARD_BG,
                    borderColor: CARD_BORDER,
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

              <section aria-labelledby="profile-notifications-heading">
                <div id="profile-notifications-heading" className="sr-only">
                  Notifications
                </div>
                <SectionHeadingRow>Notifications</SectionHeadingRow>
                <div
                  className="mt-4 space-y-5 rounded-2xl border p-4"
                  style={{
                    backgroundColor: CARD_BG,
                    borderColor: CARD_BORDER,
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
                  }}
                >
                  <NotificationToggleRow
                    label="Urgency banners"
                    description="Show reminders when missions are incomplete"
                    checked={notificationPrefs.urgencyBanners}
                    onChange={(v) => setNotificationPrefsPatch({ urgencyBanners: v })}
                    disabled={loading}
                  />
                  <div className="h-px bg-zinc-800/80" aria-hidden />
                  <NotificationToggleRow
                    label="Streak warnings"
                    description="Warn me when my streak is at risk"
                    checked={notificationPrefs.streakWarnings}
                    onChange={(v) => setNotificationPrefsPatch({ streakWarnings: v })}
                    disabled={loading}
                  />
                  <div className="h-px bg-zinc-800/80" aria-hidden />
                  <NotificationToggleRow
                    label="New week banner"
                    description="Show motivation banner every Monday"
                    checked={notificationPrefs.newWeekBanner}
                    onChange={(v) => setNotificationPrefsPatch({ newWeekBanner: v })}
                    disabled={loading}
                  />
                </div>
              </section>

              <section aria-labelledby="profile-xp-log-heading">
                <div id="profile-xp-log-heading" className="sr-only">
                  Recent XP
                </div>
                <SectionHeadingRow>Recent XP</SectionHeadingRow>
                {xpLogsSectionError ? (
                  <div className="mt-3">
                    <SectionLoadErrorCard
                      sectionLabel="recent XP"
                      message={xpLogsSectionError}
                      onRetry={() => void load()}
                    />
                  </div>
                ) : xpLogs.length === 0 ? (
                  <p
                    className="mt-3 text-sm font-medium leading-relaxed"
                    style={{ color: MUTED_BODY }}
                  >
                    No XP earned yet — complete missions to get started
                  </p>
                ) : (
                  <ul className="mt-3">
                    {xpLogs.map((row, idx) => {
                      const pos = row.amount > 0
                      const amtLabel = pos
                        ? `+${row.amount} XP`
                        : `${row.amount} XP`
                      const last = idx === xpLogs.length - 1
                      return (
                        <li
                          key={row.id}
                          className={[
                            'flex flex-col gap-1 py-3',
                            last ? '' : 'border-b',
                          ].join(' ')}
                          style={
                            last
                              ? undefined
                              : { borderBottomColor: CARD_BORDER }
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={[
                                'text-[13px] font-medium tabular-nums',
                                pos ? 'text-emerald-500' : 'text-red-400',
                              ].join(' ')}
                            >
                              {amtLabel}
                            </span>
                            <span
                              className="shrink-0 text-right text-[11px] font-medium"
                              style={{ color: MUTED_VERY }}
                            >
                              {formatRelativeXpTime(row.created_at)}
                            </span>
                          </div>
                          <p
                            className="text-[13px] font-medium"
                            style={{ color: MUTED_BODY }}
                          >
                            {formatXpLogReason(row.reason)}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section aria-labelledby="profile-account-heading">
                <div id="profile-account-heading" className="sr-only">
                  Account
                </div>
                <SectionHeadingRow>Account</SectionHeadingRow>
                <div className="mt-4 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/history')}
                    className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                    style={{
                      backgroundColor: CARD_BG,
                      borderColor: CARD_BORDER,
                    }}
                  >
                    <Clock
                      size={20}
                      className="shrink-0 text-zinc-400"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">Mission History</p>
                      <p
                        className="mt-0.5 text-xs font-medium"
                        style={{ color: MUTED_BODY }}
                      >
                        View your past missions
                      </p>
                    </div>
                    <ChevronRight
                      size={20}
                      className="shrink-0 text-zinc-500"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/share')}
                    className="min-h-[44px] w-full rounded-xl border-2 border-[#534AB7] bg-transparent px-4 py-3 text-center text-sm font-bold text-[#534AB7] transition-colors hover:bg-[#534AB7]/10"
                  >
                    Share My Stats
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignOutConfirmOpen(true)}
                    className="min-h-[44px] w-full rounded-xl border px-4 py-3 text-center text-sm font-bold transition-colors"
                    style={{
                      backgroundColor: CARD_BG,
                      borderColor: CARD_BORDER,
                      color: SIGN_OUT_RED,
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              </section>

              <p
                className="pb-6 text-center text-[11px] font-medium"
                style={{ color: MUTED_VERY }}
              >
                InHabit v1.0.0
              </p>
            </>
          ) : null}
        </div>

      {signOutConfirmOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-out-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-app-surface p-5 shadow-xl ring-1 ring-zinc-800/40">
            <p
              id="sign-out-title"
              className="text-center text-base font-bold text-white"
            >
              Sign out of InHabit?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void confirmSignOut()}
                className="rounded-xl py-3 text-sm font-bold text-white"
                style={{ backgroundColor: SIGN_OUT_RED }}
              >
                Sign out
              </button>
              <button
                type="button"
                onClick={() => setSignOutConfirmOpen(false)}
                className="rounded-xl border border-zinc-700 py-3 text-sm font-bold text-zinc-200"
              >
                Stay
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
