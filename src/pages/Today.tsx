import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Link } from 'react-router-dom'
import { GracePassModal } from '../components/GracePassModal'
import { XPToast } from '../components/XPToast'
import { getMissionBoardAccent } from '../constants/missionBoardAccents'
import { useXpToastQueue } from '../hooks/useXpToastQueue'
import { runFullClearConfetti } from '../lib/fullClearConfetti'
import { generateOneDailyMissionTitle } from '../lib/openRouterSingle'
import {
  ensureMondayGraceReset,
  useGracePass as redeemGracePass,
} from '../lib/gracePass'
import { checkAndUpdateStreak } from '../lib/streak'
import {
  awardXP,
  calculateRank,
  checkAndResetWeeklyXp,
  getWeeklyRankBandProgress,
  MAX_LEVEL,
  rankColor,
  xpPercentToNextLevel,
  xpProgressInCurrentLevel,
  xpSpanInCurrentLevel,
  type AwardXpResult,
} from '../lib/xp'
import { supabase } from '../supabase'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function wasFullClearBonusAwardedToday(userId: string): Promise<boolean> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const { data, error } = await supabase
    .from('xp_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', 'full_clear_bonus')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .limit(1)
  if (error) {
    console.error('full_clear_bonus xp_logs check failed:', error)
    return true
  }
  return (data?.length ?? 0) > 0
}

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

function streakHeaderStyle(streak: number): CSSProperties {
  if (streak <= 6) return { color: '#ffffff' }
  if (streak <= 13) return { color: '#FF6B35' }
  if (streak <= 20) return { color: '#EF9F27' }
  return {
    color: '#534AB7',
    textShadow: '0 0 12px rgba(83, 74, 183, 0.55)',
  }
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

const LEVEL_CARD_BG = '#141418'
const BAR_TRACK = '#2A2A2E'
const BAR_FILL = '#534AB7'
const LEVEL_UP_PURPLE = '#534AB7'

/** Rank pill background: rank color at ~22% opacity (15% was easy to lose on #141418). */
function rankBadgeBackground(hex: string): string {
  if (hex.length === 7 && hex.startsWith('#')) {
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    if ([r, g, b].every((n) => !Number.isNaN(n))) {
      return `rgba(${r},${g},${b},0.22)`
    }
  }
  return 'rgba(136, 135, 128, 0.22)'
}

function rankBadgeBorderRgba(hex: string, alpha: number): string {
  if (hex.length === 7 && hex.startsWith('#')) {
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    if ([r, g, b].every((n) => !Number.isNaN(n))) {
      return `rgba(${r},${g},${b},${alpha})`
    }
  }
  return `rgba(136, 135, 128, ${alpha})`
}

/**
 * `true` = bright red pill / white text (verify DOM + stacking). Set `false` for production.
 * No parent uses overflow:hidden on this card; only the progress track clips the bar fill.
 */
const DEBUG_RANK_BADGE_STYLES = false

function LevelProgressSkeleton() {
  return (
    <div className="mission-skeleton-shell mx-4 mt-[max(0.5rem,env(safe-area-inset-top))] animate-pulse rounded-2xl border border-zinc-800/80 p-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-14 shrink-0 rounded-md bg-black/22" />
        <div className="h-2 min-w-0 flex-1 rounded-full bg-black/22" />
        <div className="h-4 w-[4.5rem] shrink-0 rounded-md bg-black/22" />
      </div>
      <div className="mt-3 flex justify-start">
        <div className="h-5 w-20 rounded-full bg-black/22" />
      </div>
    </div>
  )
}

type XpProfileRow = {
  total_xp: number
  level: number
  weekly_xp: number
  rank: string
}

function normalizeRank(rankInput: unknown): string {
  if (typeof rankInput === 'string' && rankInput.trim().length > 0) {
    return rankInput.trim()
  }
  return 'Recruit'
}

const RANK_INFO_TIERS: { rank: string; minXp: number; emoji: string }[] = [
  { rank: 'Recruit', minXp: 0, emoji: '🔘' },
  { rank: 'Soldier', minXp: 300, emoji: '🟢' },
  { rank: 'Warrior', minXp: 600, emoji: '🔵' },
  { rank: 'Elite', minXp: 1000, emoji: '🟡' },
  { rank: 'Legend', minXp: 1500, emoji: '🟣' },
]

function LevelProgressCard({
  profile,
  barOverridePct,
  barTransition,
  barFlash,
  levelUpBannerLevel,
}: {
  profile: XpProfileRow
  barOverridePct: number | null
  barTransition: string
  barFlash: boolean
  levelUpBannerLevel: number | null
}) {
  const { total_xp: total, level, weekly_xp: profileWeeklyXp } = profile
  const weeklyXpVal = Math.max(0, Math.floor(profileWeeklyXp))
  const effectiveRank = calculateRank(weeklyXpVal)
  const weeklyBand = getWeeklyRankBandProgress(weeklyXpVal)
  const [rankInfoOpen, setRankInfoOpen] = useState(false)
  const rankPopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!rankInfoOpen) return
    const onDown = (e: MouseEvent) => {
      const el = rankPopoverRef.current
      if (el && !el.contains(e.target as Node)) {
        setRankInfoOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [rankInfoOpen])

  const rc = rankColor(effectiveRank)
  const fillPct =
    level >= MAX_LEVEL
      ? 100
      : barOverridePct !== null
        ? barOverridePct
        : xpPercentToNextLevel(total)
  const progIn = xpProgressInCurrentLevel(total)
  const span = xpSpanInCurrentLevel(level)
  const xpRight =
    level >= MAX_LEVEL
      ? `${total.toLocaleString()} XP`
      : `${progIn} / ${span} XP`

  return (
    <div className="shrink-0 px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div
        className="rounded-2xl border border-zinc-800/80 px-3 py-3 shadow-sm ring-1 ring-zinc-800/30"
        style={{ backgroundColor: LEVEL_CARD_BG }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="shrink-0 text-base font-bold tabular-nums text-white sm:text-lg">
            LVL {level}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="h-2.5 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: BAR_TRACK }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${fillPct}%`,
                  backgroundColor: barFlash ? '#ffffff' : BAR_FILL,
                  transition: barFlash
                    ? 'background-color 0.18s ease'
                    : `${barTransition}, background-color 0.18s ease`,
                }}
              />
            </div>
          </div>
          <span className="max-w-[5.5rem] shrink-0 text-right text-[10px] font-semibold leading-tight text-zinc-500 sm:max-w-none sm:text-xs">
            {xpRight}
          </span>
        </div>
        <div className="relative mt-2 flex justify-start" ref={rankPopoverRef}>
          <button
            type="button"
            className={[
              'inline-flex max-w-full cursor-pointer items-center rounded-full font-medium leading-tight transition-opacity active:opacity-80',
              DEBUG_RANK_BADGE_STYLES ? '' : 'px-2.5 py-0.5 text-[12px]',
            ].join(' ')}
            style={
              DEBUG_RANK_BADGE_STYLES
                ? {
                    backgroundColor: '#ff0000',
                    color: '#ffffff',
                    padding: '8px 16px',
                    fontSize: 14,
                  }
                : {
                    color: rc,
                    backgroundColor: rankBadgeBackground(rc),
                    border: `1px solid ${rankBadgeBorderRgba(rc, 0.4)}`,
                  }
            }
            aria-expanded={rankInfoOpen}
            aria-haspopup="dialog"
            aria-label={`Rank: ${effectiveRank}. Show rank info`}
            onClick={() => setRankInfoOpen((o) => !o)}
          >
            {effectiveRank}
          </button>
          {rankInfoOpen ? (
            <div
              className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-2rem,18rem)] rounded-xl border border-zinc-800/80 p-3 shadow-xl ring-1 ring-zinc-800/40"
              style={{ backgroundColor: LEVEL_CARD_BG }}
              role="dialog"
              aria-label="Weekly rank tiers"
            >
              <p className="text-xs font-medium leading-snug text-zinc-400">
                Rank resets every Monday. Earn XP this week to climb the ranks.
              </p>
              <ul className="mt-3 space-y-2 text-xs">
                {RANK_INFO_TIERS.map((t) => {
                  const tierColor = rankColor(t.rank)
                  const current = t.rank === effectiveRank
                  return (
                    <li
                      key={t.rank}
                      className={[
                        'flex items-baseline gap-2',
                        current ? 'font-bold' : 'font-medium text-zinc-500',
                      ].join(' ')}
                      style={current ? { color: tierColor } : undefined}
                    >
                      <span aria-hidden>{t.emoji}</span>
                      <span>
                        {t.rank} — {t.minXp.toLocaleString()} XP
                      </span>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-3 border-t border-zinc-800/80 pt-3">
                {weeklyBand.kind === 'legend' ? (
                  <>
                    <p className="text-[11px] font-medium leading-snug text-zinc-500">
                      Maximum rank achieved —{' '}
                      {weeklyXpVal.toLocaleString()} XP this week
                    </p>
                    <div
                      className="mt-2 h-[4px] w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: BAR_TRACK }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: '100%',
                          backgroundColor: rc,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-medium leading-snug text-zinc-500">
                      {weeklyBand.progressInBand.toLocaleString()} /{' '}
                      {weeklyBand.bandSize.toLocaleString()} XP toward{' '}
                      <span
                        style={{ color: rankColor(weeklyBand.nextRank) }}
                      >
                        {weeklyBand.nextRank}
                      </span>
                    </p>
                    <div
                      className="mt-2 h-[4px] w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: BAR_TRACK }}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-300 ease-out"
                        style={{
                          width: `${weeklyBand.percent}%`,
                          backgroundColor: rc,
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
        {levelUpBannerLevel !== null ? (
          <div
            className="-mx-3 mt-2.5 w-[calc(100%+1.5rem)] max-w-none py-2.5 text-center text-sm font-bold text-white"
            style={{ backgroundColor: LEVEL_UP_PURPLE }}
            role="status"
          >
            LEVEL UP! You reached Level {levelUpBannerLevel}
          </div>
        ) : null}
      </div>
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

  const [missionMenuOpenId, setMissionMenuOpenId] = useState<string | null>(
    null,
  )
  const [missionMenuAnchor, setMissionMenuAnchor] = useState<{
    id: string
    left: number
    top: number
    openUp: boolean
  } | null>(null)
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null)
  const [missionTitleDraft, setMissionTitleDraft] = useState('')
  const [savingMissionId, setSavingMissionId] = useState<string | null>(null)
  const [regeneratingMissionId, setRegeneratingMissionId] = useState<
    string | null
  >(null)
  const [missionActionError, setMissionActionError] = useState<string | null>(
    null,
  )
  const [confirmRemoveMission, setConfirmRemoveMission] =
    useState<TodayMission | null>(null)
  const [removingMissionIds, setRemovingMissionIds] = useState<Set<string>>(
    () => new Set(),
  )

  const [xpProfile, setXpProfile] = useState<XpProfileRow | null>(null)
  const [xpProfileLoading, setXpProfileLoading] = useState(true)
  const [barOverridePct, setBarOverridePct] = useState<number | null>(null)
  const [barTransition, setBarTransition] = useState(
    'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
  )
  const [barFlash, setBarFlash] = useState(false)
  const [levelUpBannerLevel, setLevelUpBannerLevel] = useState<number | null>(
    null,
  )

  const deferBannerForConfettiRef = useRef(false)
  const confettiCancelRef = useRef<(() => void) | null>(null)
  const awardQueueRef = useRef<AwardXpResult[]>([])
  const pumpBusyRef = useRef(false)

  const {
    toast: xpToast,
    enqueueXpToast,
    enqueueStreakToast,
    onXpToastHide,
  } = useXpToastQueue()

  const [streakCurrent, setStreakCurrent] = useState(0)
  const [, setStreakLongest] = useState(0)

  const [graceModalOpen, setGraceModalOpen] = useState(false)
  const [graceStreakBeforeMiss, setGraceStreakBeforeMiss] = useState(0)
  const [gracePassesRemaining, setGracePassesRemaining] = useState(0)
  const [gracePassSubmitting, setGracePassSubmitting] = useState(false)

  const applyFlatXp = useCallback((result: AwardXpResult) => {
    const nextRank =
      typeof result.newRank === 'string' && result.newRank.trim()
        ? result.newRank.trim()
        : 'Recruit'
    const p: XpProfileRow = {
      total_xp: result.newTotalXp,
      level: result.newLevel,
      weekly_xp: result.newWeeklyXp,
      rank: nextRank,
    }
    setXpProfile(p)
  }, [])

  const runLevelUpSequence = useCallback(async (result: AwardXpResult) => {
    setBarOverridePct(100)
    setBarTransition('width 0.3s cubic-bezier(0.4, 0, 0.2, 1)')
    await sleep(320)
    setBarFlash(true)
    await sleep(200)
    setBarFlash(false)

    const nextRank =
      typeof result.newRank === 'string' && result.newRank.trim()
        ? result.newRank.trim()
        : 'Recruit'
    const p: XpProfileRow = {
      total_xp: result.newTotalXp,
      level: result.newLevel,
      weekly_xp: result.newWeeklyXp,
      rank: nextRank,
    }
    setXpProfile(p)

    setBarOverridePct(0)
    setBarTransition('none')
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })

    const endPct =
      result.newLevel >= MAX_LEVEL
        ? 100
        : xpPercentToNextLevel(result.newTotalXp)
    setBarOverridePct(endPct)
    setBarTransition('width 0.5s cubic-bezier(0.4, 0, 0.2, 1)')
    await sleep(520)
    setBarOverridePct(null)
    setBarTransition('width 0.6s cubic-bezier(0.4, 0, 0.2, 1)')

    setLevelUpBannerLevel(result.newLevel)
    await sleep(2000)
    setLevelUpBannerLevel(null)
  }, [])

  const pumpAwardQueue = useCallback(async () => {
    if (pumpBusyRef.current) return
    pumpBusyRef.current = true
    try {
      while (awardQueueRef.current.length > 0) {
        const r = awardQueueRef.current.shift()!
        if (r.leveledUp) {
          await runLevelUpSequence(r)
        } else {
          applyFlatXp(r)
          if (awardQueueRef.current.length > 0) {
            await sleep(600)
          }
        }
      }
    } finally {
      pumpBusyRef.current = false
      if (awardQueueRef.current.length > 0) {
        void pumpAwardQueue()
      }
    }
  }, [applyFlatXp, runLevelUpSequence])

  const enqueueXpAward = useCallback(
    (result: AwardXpResult) => {
      awardQueueRef.current.push(result)
      void pumpAwardQueue()
    },
    [pumpAwardQueue],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setXpProfileLoading(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoading(false)
      setXpProfileLoading(false)
      setXpProfile(null)
      setStreakCurrent(0)
      setStreakLongest(0)
      setGraceModalOpen(false)
      setGraceStreakBeforeMiss(0)
      setGracePassesRemaining(0)
      setLoadError(userError?.message ?? 'Not signed in')
      setUserId(null)
      return
    }

    setUserId(user.id)

    await ensureMondayGraceReset(user.id)

    try {
      await checkAndResetWeeklyXp(user.id)
    } catch (weeklyErr) {
      console.error('checkAndResetWeeklyXp failed:', weeklyErr)
    }

    const [goalsRes, missionsRes, userXpRes] = await Promise.all([
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
      supabase
        .from('users')
        .select(
          'total_xp, level, weekly_xp, rank, current_streak, longest_streak, grace_passes_remaining',
        )
        .eq('id', user.id)
        .maybeSingle(),
    ])

    setLoading(false)
    setXpProfileLoading(false)

    let streakBeforeMount = 0
    let graceRem = 0

    if (userXpRes.error) {
      console.error('Failed to load XP profile:', userXpRes.error)
      setXpProfile({
        total_xp: 0,
        level: 1,
        weekly_xp: 0,
        rank: 'Recruit',
      })
      setStreakCurrent(0)
      setStreakLongest(0)
      setGracePassesRemaining(0)
    } else if (userXpRes.data) {
      const d = userXpRes.data as Record<string, unknown>
      setXpProfile({
        total_xp:
          typeof d.total_xp === 'number' && !Number.isNaN(d.total_xp)
            ? d.total_xp
            : 0,
        level:
          typeof d.level === 'number' && !Number.isNaN(d.level) ? d.level : 1,
        weekly_xp:
          typeof d.weekly_xp === 'number' && !Number.isNaN(d.weekly_xp)
            ? d.weekly_xp
            : 0,
        rank: normalizeRank(d.rank),
      })
      const cs =
        typeof d.current_streak === 'number' && !Number.isNaN(d.current_streak)
          ? Math.max(0, Math.floor(d.current_streak))
          : 0
      const ls =
        typeof d.longest_streak === 'number' && !Number.isNaN(d.longest_streak)
          ? Math.max(0, Math.floor(d.longest_streak))
          : 0
      streakBeforeMount = cs
      graceRem =
        typeof d.grace_passes_remaining === 'number' &&
        !Number.isNaN(d.grace_passes_remaining)
          ? Math.max(0, Math.floor(d.grace_passes_remaining))
          : 0
      setStreakCurrent(cs)
      setStreakLongest(ls)
      setGracePassesRemaining(graceRem)
    } else {
      setXpProfile({
        total_xp: 0,
        level: 1,
        weekly_xp: 0,
        rank: 'Recruit',
      })
      setStreakCurrent(0)
      setStreakLongest(0)
      setGracePassesRemaining(0)
    }

    if (!userXpRes.error && userXpRes.data) {
      try {
        const mountResult = await checkAndUpdateStreak(user.id, 'mount')
        setStreakCurrent(mountResult.currentStreak)
        setStreakLongest(mountResult.longestStreak)

        if (mountResult.streakReset && streakBeforeMount > 0) {
          const key = `inhabit_grace_prompt_${user.id}_${todayStr}`
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1')
            setGraceStreakBeforeMiss(streakBeforeMount)
            setGraceModalOpen(true)
          }
        }
      } catch (err) {
        console.error('checkAndUpdateStreak (mount) failed:', err)
      }
    }

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

  // Day 29 — habits: when habit completion ships, award XP + streak, e.g.
  // await checkAndUpdateStreak(userId, 'activity'); setStreak…; await awardXP(userId, 15, 'habit_complete'); enqueueXpAward(r); enqueueXpToast(15)

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

    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        const uid = user?.id
        if (!uid) return

        const streakResult = await checkAndUpdateStreak(uid, 'activity')
        setStreakCurrent(streakResult.currentStreak)
        setStreakLongest(streakResult.longestStreak)
        if (
          streakResult.streakIncremented &&
          streakResult.currentStreak > 0 &&
          streakResult.currentStreak % 7 === 0
        ) {
          enqueueStreakToast(
            `🔥 ${streakResult.currentStreak} day streak! Keep going.`,
            '#FF6B35',
          )
        }

        const missionAward = await awardXP(uid, 25, 'mission_complete')
        enqueueXpAward(missionAward)
        enqueueXpToast(25)

        if (allCompleteNow) {
          const already = await wasFullClearBonusAwardedToday(uid)
          if (!already) {
            const bonusAward = await awardXP(uid, 50, 'full_clear_bonus')
            enqueueXpAward(bonusAward)
            enqueueXpToast(50)
          }
        }
      } catch (xpErr) {
        console.error('Streak / XP award failed (mission / full clear):', xpErr)
      }
    })()
  }

  function closeMissionMenu() {
    setMissionMenuOpenId(null)
    setMissionMenuAnchor(null)
  }

  function beginEditMission(m: TodayMission) {
    closeMissionMenu()
    setMissionActionError(null)
    setEditingMissionId(m.id)
    setMissionTitleDraft(m.title ?? '')
  }

  function cancelEditMission() {
    setEditingMissionId(null)
    setMissionTitleDraft('')
  }

  async function saveMissionTitle(missionId: string) {
    if (!userId) return
    const next = missionTitleDraft.trim()
    if (!next) {
      setMissionActionError('Mission title cannot be empty')
      return
    }
    setSavingMissionId(missionId)
    setMissionActionError(null)

    const prev = missions
    setMissions((ms) =>
      ms.map((m) => (m.id === missionId ? { ...m, title: next } : m)),
    )

    const { error } = await supabase
      .from('daily_missions')
      .update({ title: next })
      .eq('id', missionId)
      .eq('user_id', userId)

    setSavingMissionId(null)

    if (error) {
      setMissions(prev)
      setMissionActionError(error.message)
      return
    }

    setEditingMissionId(null)
    setMissionTitleDraft('')
  }

  async function regenerateMission(m: TodayMission) {
    console.log(
      'Regenerating mission:',
      m.title,
      'for goal:',
      m.goalTitle,
    )
    if (!userId) {
      console.error('Regenerating mission failed: missing userId')
      return
    }
    closeMissionMenu()
    setMissionActionError(null)
    setRegeneratingMissionId(m.id)
    try {
      const { data: profile, error: pErr } = await supabase
        .from('users')
        .select('goal_context')
        .eq('id', userId)
        .maybeSingle()
      if (pErr) throw new Error(pErr.message)

      let userContextText = 'n/a'
      const raw = profile?.goal_context
      const cat = m.category ?? 'health_habits'
      if (
        raw &&
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        cat in (raw as object)
      ) {
        const slice = (raw as Record<string, unknown>)[cat]
        if (slice && typeof slice === 'object' && !Array.isArray(slice)) {
          userContextText = JSON.stringify(slice)
        }
      }

      const avoidTitles = missions
        .filter((x) => x.goal_id === m.goal_id)
        .map((x) => x.title)

      const nextTitle = await generateOneDailyMissionTitle({
        goalTitle: m.goalTitle,
        category: cat,
        userContextText,
        avoidTitles,
      })
      console.log('Generated new mission:', nextTitle)

      const { error: uErr } = await supabase
        .from('daily_missions')
        .update({ title: nextTitle })
        .eq('id', m.id)
        .eq('user_id', userId)
      if (uErr) throw new Error(uErr.message)
      console.log('Saved to Supabase')

      setMissions((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, title: nextTitle } : x)),
      )
    } catch (e) {
      console.error('Regenerate mission failed:', e)
      setMissionActionError(
        e instanceof Error ? e.message : 'Could not regenerate mission',
      )
    } finally {
      setRegeneratingMissionId(null)
    }
  }

  async function removeMissionConfirmed(m: TodayMission) {
    console.log('Deleting mission:', m.id)
    if (!userId) {
      console.error('Delete mission failed: missing userId')
      return
    }
    setConfirmRemoveMission(null)
    setMissionActionError(null)
    const { error } = await supabase
      .from('daily_missions')
      .delete()
      .eq('id', m.id)
      .eq('user_id', userId)
    if (error) {
      console.error('Delete mission failed:', error)
      setMissionActionError(error.message)
      return
    }
    console.log('Delete successful')
    setRemovingMissionIds((prev) => {
      const next = new Set(prev)
      next.add(m.id)
      return next
    })
    window.setTimeout(() => {
      setMissions((prev) => prev.filter((x) => x.id !== m.id))
      setRemovingMissionIds((prev) => {
        const next = new Set(prev)
        next.delete(m.id)
        return next
      })
    }, 260)
  }

  const handleGraceUse = useCallback(async () => {
    if (!userId) return
    setGracePassSubmitting(true)
    try {
      const out = await redeemGracePass(userId, graceStreakBeforeMiss)
      applyFlatXp(out.awardResult)
      setStreakCurrent(graceStreakBeforeMiss)
      setGracePassesRemaining((g) => Math.max(0, g - 1))
      setGraceModalOpen(false)
      enqueueStreakToast('🛡️ Streak saved! -30 XP', '#534AB7')
    } catch (e) {
      console.error('redeemGracePass failed:', e)
    } finally {
      setGracePassSubmitting(false)
    }
  }, [userId, graceStreakBeforeMiss, applyFlatXp, enqueueStreakToast])

  const handleGraceDismiss = useCallback(() => {
    setGraceModalOpen(false)
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      {userId && xpProfileLoading ? <LevelProgressSkeleton /> : null}
      {userId && xpProfile && !xpProfileLoading ? (
        <LevelProgressCard
          profile={xpProfile}
          barOverridePct={barOverridePct}
          barTransition={barTransition}
          barFlash={barFlash}
          levelUpBannerLevel={levelUpBannerLevel}
        />
      ) : null}
      {xpToast ? (
        xpToast.payload.kind === 'xp' ? (
          <XPToast
            key={xpToast.key}
            variant="xp"
            amount={xpToast.payload.amount}
            visible
            onHide={onXpToastHide}
            topPaddingClass="pt-[max(7.25rem,calc(env(safe-area-inset-top)+6.25rem))]"
          />
        ) : (
          <XPToast
            key={xpToast.key}
            variant="streak"
            message={xpToast.payload.message}
            accentColor={xpToast.payload.accentColor}
            visible
            onHide={onXpToastHide}
            topPaddingClass="pt-[max(7.25rem,calc(env(safe-area-inset-top)+6.25rem))]"
          />
        )
      ) : null}
      <GracePassModal
        visible={graceModalOpen}
        streakBeforeMiss={graceStreakBeforeMiss}
        gracePasses={gracePassesRemaining}
        useInProgress={gracePassSubmitting}
        onUseGracePass={handleGraceUse}
        onDismiss={handleGraceDismiss}
      />
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
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
          </div>
          {streakCurrent > 0 ? (
            <p
              className="shrink-0 pt-0.5 text-base font-bold tabular-nums"
              style={streakHeaderStyle(streakCurrent)}
            >
              🔥 {streakCurrent} day streak
            </p>
          ) : null}
        </div>
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
            {missionActionError ? (
              <p className="mb-3 text-center text-sm font-medium text-red-400 transition-opacity">
                {missionActionError}
              </p>
            ) : null}
            {missions.map((m, index) => {
              const accent = getMissionBoardAccent(m.category)
              const isPressing = pressingMissionId === m.id
              const menuOpen = missionMenuOpenId === m.id
              const isEditing = editingMissionId === m.id
              const savingThis = savingMissionId === m.id
              const regeneratingThis = regeneratingMissionId === m.id
              const removing = removingMissionIds.has(m.id)
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
                      'relative flex transform-gpu items-stretch gap-3 rounded-2xl border border-zinc-800/80 bg-app-surface p-4 shadow-sm will-change-transform',
                      m.completed ? 'opacity-50' : 'opacity-100',
                      removing ? 'opacity-0' : '',
                      isPressing
                        ? 'scale-[0.97] transition-none'
                        : 'scale-100 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                    ].join(' ')}
                    onPointerDownCapture={(e) => {
                      if (m.completed) return
                      const el = e.target
                      if (!(el instanceof Element)) return
                      if (
                        !el.closest('[data-mission-checkbox]') &&
                        !el.closest('[data-mission-menu]')
                      ) {
                        return
                      }
                      if (el.closest('[data-mission-menu]')) return
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
                        {isEditing ? (
                          <div>
                            <label
                              htmlFor={`mission-edit-${m.id}`}
                              className="sr-only"
                            >
                              Mission title
                            </label>
                            <input
                              id={`mission-edit-${m.id}`}
                              type="text"
                              value={missionTitleDraft}
                              onChange={(e) =>
                                setMissionTitleDraft(e.target.value)
                              }
                              disabled={savingThis}
                              className="w-full rounded-xl border border-zinc-800 bg-app-surface px-3 py-2.5 text-sm font-bold text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 disabled:opacity-50"
                            />
                            <div className="mt-2 flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => void saveMissionTitle(m.id)}
                                disabled={savingThis}
                                className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-app-bg disabled:opacity-50"
                              >
                                {savingThis ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditMission}
                                disabled={savingThis}
                                className="text-xs font-semibold text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p
                            className={[
                              'text-base font-bold leading-snug text-white',
                              m.completed ? 'line-through' : '',
                            ].join(' ')}
                          >
                            {regeneratingThis ? 'Regenerating…' : m.title}
                          </p>
                        )}
                        <p className="mt-1 truncate text-sm font-medium text-zinc-500">
                          {m.goalTitle}
                        </p>
                      </div>

                      {!m.completed && !isEditing ? (
                        <div className="shrink-0">
                          <button
                            type="button"
                            data-mission-menu
                            aria-label="Mission options"
                            aria-expanded={menuOpen}
                            onClick={(e) => {
                              const nextOpen = missionMenuOpenId !== m.id
                              if (!nextOpen) {
                                closeMissionMenu()
                                return
                              }
                              const rect = (
                                e.currentTarget as HTMLButtonElement
                              ).getBoundingClientRect()
                              const menuW = 224
                              const menuH = 156
                              const spaceBelow = window.innerHeight - rect.bottom
                              const spaceAbove = rect.top
                              const openUp =
                                spaceBelow < menuH + 12 && spaceAbove > spaceBelow
                              const left = Math.max(
                                8,
                                Math.min(
                                  window.innerWidth - menuW - 8,
                                  rect.right - menuW,
                                ),
                              )
                              const top = openUp
                                ? Math.max(8, rect.top - menuH - 8)
                                : rect.bottom + 8
                              setMissionMenuOpenId(m.id)
                              setMissionMenuAnchor({ id: m.id, left, top, openUp })
                            }}
                            className="flex h-11 w-9 min-h-[44px] min-w-[36px] items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
                          >
                            <span className="text-xl leading-none" aria-hidden>
                              ⋯
                            </span>
                          </button>
                        </div>
                      ) : null}

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

      {missionMenuOpenId ? (
        <button
          type="button"
          className="fixed inset-0 z-40"
          aria-label="Close mission menu"
          onClick={closeMissionMenu}
        />
      ) : null}

      {missionMenuAnchor && missionMenuOpenId === missionMenuAnchor.id ? (
        <div
          className="fixed z-[999] w-56 overflow-hidden rounded-xl border border-zinc-800 bg-app-bg shadow-2xl"
          style={{ left: missionMenuAnchor.left, top: missionMenuAnchor.top }}
        >
          <button
            type="button"
            onClick={() => {
              const mm = missions.find((x) => x.id === missionMenuAnchor.id)
              if (mm) beginEditMission(mm)
            }}
            className="w-full px-4 py-3 text-left text-sm font-semibold text-white hover:bg-zinc-900/60"
          >
            Edit mission title
          </button>
          <button
            type="button"
            onClick={() => {
              const mm = missions.find((x) => x.id === missionMenuAnchor.id)
              if (mm) void regenerateMission(mm)
            }}
            disabled={!!regeneratingMissionId}
            className="w-full px-4 py-3 text-left text-sm font-semibold text-white hover:bg-zinc-900/60 disabled:opacity-50"
          >
            Regenerate this mission
          </button>
          <button
            type="button"
            onClick={() => {
              const mm = missions.find((x) => x.id === missionMenuAnchor.id)
              closeMissionMenu()
              if (mm) setConfirmRemoveMission(mm)
            }}
            className="w-full px-4 py-3 text-left text-sm font-semibold text-red-300 hover:bg-zinc-900/60"
          >
            Delete this mission
          </button>
        </div>
      ) : null}

      {confirmRemoveMission ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(13,13,15,0.8)' }}
            aria-label="Close remove mission confirmation"
            onClick={() => setConfirmRemoveMission(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-800/80 bg-app-bg p-5 shadow-2xl">
            <p className="text-base font-bold text-white">
              Remove this mission from today?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              &ldquo;{confirmRemoveMission.title}&rdquo;
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void removeMissionConfirmed(confirmRemoveMission)}
                className="flex-1 rounded-xl bg-red-500 px-4 py-3.5 text-sm font-bold text-white"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemoveMission(null)}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/40 px-4 py-3.5 text-sm font-bold text-zinc-300"
              >
                Keep
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
