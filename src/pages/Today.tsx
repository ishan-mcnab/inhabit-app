import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  getLocalISOWeek,
  getLocalISOWeekYear,
  localWeekMondaySundayYmd,
  previousIsoWeek,
} from '../lib/isoWeek'
import { GracePassModal } from '../components/GracePassModal'
import { StreakMilestoneModal } from '../components/StreakMilestoneModal'
import { XPToast } from '../components/XPToast'
import { useNotifications } from '../context/NotificationContext'
import { getMissionBoardAccent } from '../constants/missionBoardAccents'
import { useXpToastQueue } from '../hooks/useXpToastQueue'
import { runFullClearConfetti } from '../lib/fullClearConfetti'
import { updateHabitStreak } from '../lib/habitStreak'
import { streakTierTextStyle } from '../lib/streakTierStyle'
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
  getMostRecentMondayYmd,
  getWeeklyRankBandProgress,
  localDayStartEndIso,
  localWeekStartEndIso,
  MAX_LEVEL,
  nextRankNameFromWeeklyXp,
  rankColor,
  weeklyXpRemainingToNextRank,
  xpPercentToNextLevel,
  xpProgressInCurrentLevel,
  xpSpanInCurrentLevel,
  type AwardXpResult,
} from '../lib/xp'
import { checkAndRegenerateWeeklyMissions } from '../lib/weeklyMissionReset'
import { useNotificationPrefs } from '../hooks/useNotificationPrefs'
import { supabase } from '../supabase'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** Calendar days since the start of the most recent local Sunday (used for missed-reflection copy). */
function daysSinceLastLocalSundayStart(): number {
  const x = new Date()
  x.setHours(0, 0, 0, 0)
  const dow = x.getDay()
  const lastSun = new Date(x)
  lastSun.setDate(x.getDate() - (dow === 0 ? 0 : dow))
  return Math.max(
    1,
    Math.round((x.getTime() - lastSun.getTime()) / 86_400_000),
  )
}

/** True if `full_clear_bonus` was already logged for this user on the *local* calendar day. */
async function wasFullClearBonusAwardedToday(userId: string): Promise<boolean> {
  const { startIso, endIso } = localDayStartEndIso()
  const { count, error } = await supabase
    .from('xp_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('reason', 'full_clear_bonus')
    .gte('created_at', startIso)
    .lte('created_at', endIso)
  if (error) {
    console.error('full_clear_bonus xp_logs check failed:', error)
    return true
  }
  const n = count ?? 0
  if (n > 1) {
    console.warn(
      '[XP] Multiple full_clear_bonus rows for today — data may need cleanup',
    )
  }
  return n > 0
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function countMissionCompleteXpLogsToday(userId: string): Promise<number | null> {
  const { startIso, endIso } = localDayStartEndIso()
  const { count, error } = await supabase
    .from('xp_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('reason', 'mission_complete')
    .gte('created_at', startIso)
    .lte('created_at', endIso)
  if (error) {
    console.error('mission_complete xp_logs count failed:', error)
    return null
  }
  return count ?? 0
}

async function countCompletedMissionsDueToday(
  userId: string,
  dueDateYmd: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from('daily_missions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('due_date', dueDateYmd)
    .eq('completed', true)
  if (error) {
    console.error('daily_missions completed count failed:', error)
    return null
  }
  return count ?? 0
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

type HabitRow = {
  id: string
  title: string
  category: string | null
  frequency: string | null
  time_of_day: string | null
  current_streak: number
  last_completed: string | null
}

type TodayHabit = HabitRow & {
  completedToday: boolean
}

type HabitMenuPhase = 'main' | 'frequency' | 'time'

const SKELETON_STRIPE = '#52525b'

function MissionSkeleton() {
  return (
    <div className="mission-skeleton-shell flex min-h-[64px] items-stretch gap-3 rounded-2xl border border-zinc-800/80 p-4 shadow-sm">
      <div
        className="w-[3px] shrink-0 self-stretch rounded-full"
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

function CheckIcon({ small }: { small?: boolean }) {
  return (
    <svg
      className={small ? 'h-3.5 w-3.5 text-white' : 'h-5 w-5 text-white'}
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

const LEVEL_CARD_BG = 'rgba(83, 74, 183, 0.05)'
const LEVEL_CARD_BORDER = '1px solid rgba(83, 74, 183, 0.2)'
const BAR_TRACK = '#2A2A2E'
const BAR_FILL = '#534AB7'
const LEVEL_UP_PURPLE = '#534AB7'
const MUTED_HEADING = '#888780'
const CARD_SURFACE = '#141418'
const CARD_BORDER = 'rgba(255,255,255,0.08)'

/** Rank pill background — slightly stronger for readability on dark cards */
function rankBadgeBackground(hex: string): string {
  if (hex.length === 7 && hex.startsWith('#')) {
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    if ([r, g, b].every((n) => !Number.isNaN(n))) {
      return `rgba(${r},${g},${b},0.25)`
    }
  }
  return 'rgba(136, 135, 128, 0.25)'
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
    <div className="mission-skeleton-shell mx-4 mt-3 animate-pulse rounded-2xl border border-zinc-800/80 p-4">
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

  const weeklyRankMilestoneHint = useMemo(() => {
    const need = weeklyXpRemainingToNextRank(weeklyXpVal)
    const nextName = nextRankNameFromWeeklyXp(weeklyXpVal)
    if (need === null || nextName === null || need <= 0) return null
    return `${need.toLocaleString()} more XP to reach ${nextName}`
  }, [weeklyXpVal])

  return (
    <div className="shrink-0 px-4 pt-3">
      <div
        className="rounded-2xl px-4 py-3.5 shadow-sm"
        style={{
          backgroundColor: LEVEL_CARD_BG,
          border: LEVEL_CARD_BORDER,
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="shrink-0 text-[18px] font-bold tabular-nums text-white">
            LVL {level}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="h-2 w-full overflow-hidden rounded-full"
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
          <span className="max-w-[6rem] shrink-0 text-right text-[12px] font-medium leading-tight text-zinc-500 sm:max-w-none">
            {xpRight}
          </span>
        </div>
        <div
          className="relative mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1"
          ref={rankPopoverRef}
        >
          <button
            type="button"
            className={[
              'inline-flex max-w-full shrink-0 cursor-pointer items-center rounded-full font-medium leading-tight transition-opacity active:opacity-80',
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
          {weeklyRankMilestoneHint ? (
            <>
              <span
                className="shrink-0 text-[11px] font-medium text-zinc-500"
                aria-hidden
              >
                ·
              </span>
              <span className="min-w-0 text-[11px] font-medium leading-snug text-zinc-500">
                {weeklyRankMilestoneHint}
              </span>
            </>
          ) : null}
          {rankInfoOpen ? (
            <div
              className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-2rem,18rem)] rounded-xl border border-zinc-800/80 p-3 shadow-xl ring-1 ring-zinc-800/40"
              style={{ backgroundColor: CARD_SURFACE }}
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
  const location = useLocation()
  const { setFromToday } = useNotifications()
  const [notificationPrefs] = useNotificationPrefs()
  const todayStr = useMemo(() => formatLocalDate(new Date()), [])
  const headingDate = useMemo(() => formatTodayHeading(new Date()), [])
  const [clockHour, setClockHour] = useState(() => new Date().getHours())

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
  const newWeekBannerTimersRef = useRef<number[]>([])
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

  const [habitsLoading, setHabitsLoading] = useState(true)
  const [reflectionNudge, setReflectionNudge] = useState<
    'none' | 'sunday' | 'missed'
  >('none')
  const [reflectionMissedDaysAgo, setReflectionMissedDaysAgo] = useState(1)
  const [reflectionBannerName, setReflectionBannerName] = useState('—')
  const [reflectionWeekMissionRate, setReflectionWeekMissionRate] = useState<
    number | null
  >(null)

  const refreshReflectionStatus = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) return

    const now = new Date()
    const cw = getLocalISOWeek(now)
    const cy = getLocalISOWeekYear(now)
    const { week: pw, isoYear: py } = previousIsoWeek(cw, cy)
    const { mon, sun } = localWeekMondaySundayYmd(now)
    const { startIso: wStartIso, endIso: wEndIso } = localWeekStartEndIso(now)

    const [curRes, prevRes, weekTotalRes, weekDoneRes] = await Promise.all([
      supabase
        .from('reflections')
        .select('id')
        .eq('user_id', user.id)
        .eq('iso_week_year', cy)
        .eq('week_number', cw)
        .maybeSingle(),
      supabase
        .from('reflections')
        .select('id')
        .eq('user_id', user.id)
        .eq('iso_week_year', py)
        .eq('week_number', pw)
        .maybeSingle(),
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
        .gte('completed_at', wStartIso)
        .lte('completed_at', wEndIso)
        .not('completed_at', 'is', null),
    ])

    if (!weekTotalRes.error && !weekDoneRes.error) {
      const tot = weekTotalRes.count ?? 0
      const done = weekDoneRes.count ?? 0
      const rate = tot <= 0 ? 0 : Math.min(100, Math.round((done / tot) * 100))
      setReflectionWeekMissionRate(rate)
    }

    if (curRes.error || prevRes.error) {
      setReflectionNudge('none')
      return
    }

    if (now.getDay() === 0) {
      setReflectionNudge(!curRes.data ? 'sunday' : 'none')
      return
    }

    if (prevRes.data || curRes.data) {
      setReflectionNudge('none')
      return
    }

    setReflectionNudge('missed')
    setReflectionMissedDaysAgo(daysSinceLastLocalSundayStart())
  }, [])
  const [habits, setHabits] = useState<TodayHabit[]>([])
  const [habitCompletingIds, setHabitCompletingIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [pressingHabitId, setPressingHabitId] = useState<string | null>(null)
  const [habitCheckboxRippleId, setHabitCheckboxRippleId] = useState<
    string | null
  >(null)

  const [habitMenuOpenId, setHabitMenuOpenId] = useState<string | null>(null)
  const [habitMenuAnchor, setHabitMenuAnchor] = useState<{
    id: string
    left: number
    top: number
    openUp: boolean
  } | null>(null)
  const [habitMenuPhase, setHabitMenuPhase] = useState<HabitMenuPhase>('main')

  const [editingHabitId, setEditingHabitId] = useState<string | null>(null)
  const [habitTitleDraft, setHabitTitleDraft] = useState('')
  const [savingHabitId, setSavingHabitId] = useState<string | null>(null)
  const [habitActionError, setHabitActionError] = useState<string | null>(null)
  const [confirmDeleteHabit, setConfirmDeleteHabit] = useState<TodayHabit | null>(
    null,
  )
  const [removingHabitIds, setRemovingHabitIds] = useState<Set<string>>(
    () => new Set(),
  )

  const [graceModalOpen, setGraceModalOpen] = useState(false)
  const [graceStreakBeforeMiss, setGraceStreakBeforeMiss] = useState(0)
  const [gracePassesRemaining, setGracePassesRemaining] = useState(0)
  const [gracePassSubmitting, setGracePassSubmitting] = useState(false)

  const [streakMilestoneOpen, setStreakMilestoneOpen] = useState(false)
  const [streakMilestoneCount, setStreakMilestoneCount] = useState(0)

  const [missionRegenerating, setMissionRegenerating] = useState(false)
  const [weeklyNewMissionsBannerPhase, setWeeklyNewMissionsBannerPhase] =
    useState<'off' | 'visible' | 'fading'>('off')
  const [newWeekMotivationPhase, setNewWeekMotivationPhase] = useState<
    'off' | 'visible' | 'fading'
  >('off')

  const handleStreakMilestoneClose = useCallback(() => {
    setStreakMilestoneOpen(false)
  }, [])

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

  const reloadTodayMissions = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
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
        .eq('user_id', uid)
        .eq('due_date', todayStr)
        .order('created_at', { ascending: true })
      if (error) {
        console.error('reloadTodayMissions failed:', error)
        return
      }
      const rows = (data ?? []) as unknown as MissionRow[]
      setMissions(rows.map(mapRowToMission))
    },
    [todayStr],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setXpProfileLoading(true)
    setHabitsLoading(true)
    setReflectionNudge('none')
    setReflectionBannerName('—')
    setReflectionWeekMissionRate(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoading(false)
      setXpProfileLoading(false)
      setHabitsLoading(false)
      setXpProfile(null)
      setStreakCurrent(0)
      setStreakLongest(0)
      setGraceModalOpen(false)
      setGraceStreakBeforeMiss(0)
      setGracePassesRemaining(0)
      setLoadError(userError?.message ?? 'Not signed in')
      setUserId(null)
      setHabits([])
      return
    }

    setUserId(user.id)

    await ensureMondayGraceReset(user.id)

    try {
      await checkAndResetWeeklyXp(user.id)
    } catch (weeklyErr) {
      console.error('checkAndResetWeeklyXp failed:', weeklyErr)
    }

    const { startIso, endIso } = localDayStartEndIso()

    const [goalsRes, missionsRes, userXpRes, habitsRes, habitLogsRes] =
      await Promise.all([
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
          'total_xp, level, weekly_xp, rank, current_streak, longest_streak, grace_passes_remaining, display_name',
        )
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('habits')
        .select(
          'id,title,category,frequency,time_of_day,current_streak,last_completed,created_at',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('habit_logs')
        .select('habit_id')
        .eq('user_id', user.id)
        .gte('completed_at', startIso)
        .lte('completed_at', endIso),
    ])

    setLoading(false)
    setXpProfileLoading(false)
    setHabitsLoading(false)

    let streakBeforeMount = 0
    let streakForDebug = 0
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
      const dn = typeof d.display_name === 'string' ? d.display_name.trim() : ''
      setReflectionBannerName(dn || '—')
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
      streakForDebug = cs
      graceRem =
        typeof d.grace_passes_remaining === 'number' &&
        !Number.isNaN(d.grace_passes_remaining)
          ? Math.max(0, Math.floor(d.grace_passes_remaining))
          : 0
      setStreakCurrent(cs)
      setStreakLongest(ls)
      setGracePassesRemaining(graceRem)
    } else {
      setReflectionBannerName('—')
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
        streakForDebug = mountResult.currentStreak

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

    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('inhabit_debug') === 'true' &&
      userXpRes.data &&
      !userXpRes.error
    ) {
      const dbg = userXpRes.data as Record<string, unknown>
      const total =
        typeof dbg.total_xp === 'number' && !Number.isNaN(dbg.total_xp)
          ? dbg.total_xp
          : 0
      const weekly =
        typeof dbg.weekly_xp === 'number' && !Number.isNaN(dbg.weekly_xp)
          ? dbg.weekly_xp
          : 0
      const level =
        typeof dbg.level === 'number' && !Number.isNaN(dbg.level)
          ? dbg.level
          : 1
      const rank = normalizeRank(dbg.rank)
      console.log(
        `[InHabit] XP Summary — Total: ${total} | Weekly: ${weekly} | Level: ${level} | Rank: ${rank} | Streak: ${streakForDebug} days`,
      )
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

    void (async () => {
      setMissionRegenerating(true)
      try {
        const result = await checkAndRegenerateWeeklyMissions(user.id)
        if (result.regenerated && result.goalsUpdated > 0) {
          setWeeklyNewMissionsBannerPhase('visible')
          window.setTimeout(() => setWeeklyNewMissionsBannerPhase('fading'), 3000)
          window.setTimeout(() => {
            setWeeklyNewMissionsBannerPhase('off')
            void reloadTodayMissions(user.id)
          }, 3300)
        }
      } catch (e) {
        console.error('checkAndRegenerateWeeklyMissions failed:', e)
      } finally {
        setMissionRegenerating(false)
      }
    })()

    if (habitsRes.error) {
      console.error('Failed to load habits:', habitsRes.error)
      setHabits([])
    } else {
      const doneIds = new Set<string>(
        ((habitLogsRes.data ?? []) as unknown as Record<string, unknown>[])
          .map((r) => (typeof r.habit_id === 'string' ? r.habit_id : null))
          .filter((x): x is string => !!x),
      )
      const hs = ((habitsRes.data ?? []) as unknown as HabitRow[]).map((h) => ({
        ...h,
        completedToday: doneIds.has(h.id),
      }))
      setHabits(hs)
    }

    const now = new Date()
    const cw = getLocalISOWeek(now)
    const cy = getLocalISOWeekYear(now)
    const { week: pw, isoYear: py } = previousIsoWeek(cw, cy)
    const { mon, sun } = localWeekMondaySundayYmd(now)
    const { startIso: wStartIso, endIso: wEndIso } = localWeekStartEndIso(now)
    const [curRes, prevRes, weekTotalRes, weekDoneRes] = await Promise.all([
      supabase
        .from('reflections')
        .select('id')
        .eq('user_id', user.id)
        .eq('iso_week_year', cy)
        .eq('week_number', cw)
        .maybeSingle(),
      supabase
        .from('reflections')
        .select('id')
        .eq('user_id', user.id)
        .eq('iso_week_year', py)
        .eq('week_number', pw)
        .maybeSingle(),
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
        .gte('completed_at', wStartIso)
        .lte('completed_at', wEndIso)
        .not('completed_at', 'is', null),
    ])

    if (!weekTotalRes.error && !weekDoneRes.error) {
      const tot = weekTotalRes.count ?? 0
      const done = weekDoneRes.count ?? 0
      const rate = tot <= 0 ? 0 : Math.min(100, Math.round((done / tot) * 100))
      setReflectionWeekMissionRate(rate)
    }

    if (curRes.error || prevRes.error) {
      setReflectionNudge('none')
    } else if (now.getDay() === 0) {
      setReflectionNudge(!curRes.data ? 'sunday' : 'none')
    } else if (prevRes.data || curRes.data) {
      setReflectionNudge('none')
    } else {
      setReflectionNudge('missed')
      setReflectionMissedDaysAgo(daysSinceLastLocalSundayStart())
    }
  }, [todayStr, reloadTodayMissions])

  useEffect(() => {
    void load()
  }, [load])

  const dismissNewWeekMotivation = useCallback(() => {
    for (const id of newWeekBannerTimersRef.current) {
      window.clearTimeout(id)
    }
    newWeekBannerTimersRef.current = []
    try {
      localStorage.setItem(
        `inhabit_new_week_banner_${getMostRecentMondayYmd()}`,
        '1',
      )
    } catch {
      /* ignore */
    }
    setNewWeekMotivationPhase('off')
  }, [])

  useEffect(() => {
    if (loading || loadError || !userId) return
    if (!notificationPrefs.newWeekBanner) return
    if (new Date().getDay() !== 1) return
    const mon = getMostRecentMondayYmd()
    const key = `inhabit_new_week_banner_${mon}`
    try {
      if (localStorage.getItem(key)) return
    } catch {
      return
    }
    setNewWeekMotivationPhase('visible')
    newWeekBannerTimersRef.current = [
      window.setTimeout(() => setNewWeekMotivationPhase('fading'), 4000),
      window.setTimeout(() => {
        try {
          localStorage.setItem(key, '1')
        } catch {
          /* ignore */
        }
        setNewWeekMotivationPhase('off')
      }, 4300),
    ]
    return () => {
      for (const id of newWeekBannerTimersRef.current) {
        window.clearTimeout(id)
      }
      newWeekBannerTimersRef.current = []
    }
  }, [loading, loadError, userId, notificationPrefs.newWeekBanner])

  useEffect(() => {
    const tick = () => setClockHour(new Date().getHours())
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!userId || loading) return
    const incomplete = missions.filter((m) => !m.completed).length
    setFromToday({
      incompleteMissionsCount: incomplete,
      reflectionDue: reflectionNudge === 'sunday',
    })
  }, [userId, loading, missions, reflectionNudge, setFromToday])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void refreshReflectionStatus()
    }
    const onWindowFocus = () => {
      void refreshReflectionStatus()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onWindowFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onWindowFocus)
    }
  }, [refreshReflectionStatus])

  // In-app navigation back from /reflection does not always fire focus/visibility.
  useEffect(() => {
    if (location.pathname !== '/today') return
    void refreshReflectionStatus()
  }, [location.pathname, refreshReflectionStatus])

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

        // currentStreak / streakIncremented / streakReset come from checkAndUpdateStreak’s
        // return value (DB already updated for activity context) — not from React state.
        const streakResult = await checkAndUpdateStreak(uid, 'activity')
        const { currentStreak, streakIncremented } = streakResult

        setStreakCurrent(streakResult.currentStreak)
        setStreakLongest(streakResult.longestStreak)

        if (
          streakIncremented &&
          currentStreak > 0 &&
          currentStreak % 7 === 0
        ) {
          const milestoneAward = await awardXP(
            uid,
            100,
            'streak_milestone',
          )
          enqueueXpAward(milestoneAward)
          setStreakMilestoneCount(currentStreak)
          setStreakMilestoneOpen(true)
        }

        const [missionXpLogs, completedToday] = await Promise.all([
          countMissionCompleteXpLogsToday(uid),
          countCompletedMissionsDueToday(uid, todayStr),
        ])
        const skipMissionXp =
          missionXpLogs !== null &&
          completedToday !== null &&
          missionXpLogs >= completedToday
        if (skipMissionXp) {
          console.warn('[XP] Duplicate mission XP prevented')
        } else {
          const missionAward = await awardXP(uid, 25, 'mission_complete')
          enqueueXpAward(missionAward)
          enqueueXpToast(25)
        }

        if (allCompleteNow) {
          const already = await wasFullClearBonusAwardedToday(uid)
          if (!already) {
            const bonusAward = await awardXP(uid, 50, 'full_clear_bonus')
            enqueueXpAward(bonusAward)
            enqueueXpToast(50)
          }
        }

        // TODO Day 31: Award +75 XP with reason 'weekly_reflection'
        // after reflection is submitted successfully
      } catch (xpErr) {
        console.error('Streak / XP award failed (mission / full clear):', xpErr)
      }
    })()
  }

  const sortedVisibleHabits = useMemo(() => {
    const day = new Date().getDay()
    const weekend = day === 0 || day === 6
    const base = weekend
      ? habits.filter((h) => (h.frequency ?? 'daily') !== 'weekdays')
      : habits
    return [...base].sort((a, b) => {
      if (a.completedToday !== b.completedToday) {
        return a.completedToday ? 1 : -1
      }
      return 0
    })
  }, [habits])

  async function handleCompleteHabit(habitId: string) {
    if (!userId) return
    if (habitCompletingIds.has(habitId)) return

    const h = habits.find((x) => x.id === habitId)
    if (!h || h.completedToday) return

    setHabitCompletingIds((prev) => {
      const next = new Set(prev)
      next.add(habitId)
      return next
    })

    const { startIso, endIso } = localDayStartEndIso()

    try {
      const { data: exists, error: exErr } = await supabase
        .from('habit_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('habit_id', habitId)
        .gte('completed_at', startIso)
        .lte('completed_at', endIso)
        .limit(1)

      if (exErr) throw new Error(exErr.message)
      if ((exists?.length ?? 0) > 0) {
        setHabits((prev) =>
          prev.map((x) => (x.id === habitId ? { ...x, completedToday: true } : x)),
        )
        return
      }

      setHabits((prev) =>
        prev.map((x) => (x.id === habitId ? { ...x, completedToday: true } : x)),
      )

      const { error: insErr } = await supabase.from('habit_logs').insert({
        habit_id: habitId,
        user_id: userId,
        completed_at: new Date().toISOString(),
      })
      if (insErr) throw new Error(insErr.message)

      setHabitCheckboxRippleId(habitId)
      window.setTimeout(() => {
        setHabitCheckboxRippleId((prev) => (prev === habitId ? null : prev))
      }, 650)

      const streakOut = await updateHabitStreak(habitId, userId)
      setHabits((prev) =>
        prev.map((x) =>
          x.id === habitId
            ? {
                ...x,
                current_streak: streakOut.newStreak,
                last_completed: todayStr,
                completedToday: true,
              }
            : x,
        ),
      )

      const habitAward = await awardXP(userId, 15, 'habit_complete')
      enqueueXpAward(habitAward)
      enqueueXpToast(15)

      const streakResult = await checkAndUpdateStreak(userId, 'activity')
      setStreakCurrent(streakResult.currentStreak)
      setStreakLongest(streakResult.longestStreak)
    } catch (e) {
      console.error('Habit completion failed:', e)
      setHabits((prev) =>
        prev.map((x) => (x.id === habitId ? { ...x, completedToday: false } : x)),
      )
    } finally {
      setHabitCompletingIds((prev) => {
        const next = new Set(prev)
        next.delete(habitId)
        return next
      })
    }
  }

  function closeHabitMenu() {
    setHabitMenuOpenId(null)
    setHabitMenuAnchor(null)
    setHabitMenuPhase('main')
  }

  function beginEditHabit(h: TodayHabit) {
    closeHabitMenu()
    setHabitActionError(null)
    setEditingHabitId(h.id)
    setHabitTitleDraft(h.title ?? '')
  }

  function cancelEditHabit() {
    setEditingHabitId(null)
    setHabitTitleDraft('')
  }

  async function saveHabitTitle(habitId: string) {
    if (!userId) return
    const next = habitTitleDraft.trim()
    if (!next) {
      setHabitActionError('Habit name cannot be empty')
      return
    }
    setSavingHabitId(habitId)
    setHabitActionError(null)
    const prev = habits
    setHabits((hs) =>
      hs.map((h) => (h.id === habitId ? { ...h, title: next } : h)),
    )
    const { error } = await supabase
      .from('habits')
      .update({ title: next })
      .eq('id', habitId)
      .eq('user_id', userId)
    setSavingHabitId(null)
    if (error) {
      setHabits(prev)
      setHabitActionError(error.message)
      return
    }
    setEditingHabitId(null)
    setHabitTitleDraft('')
  }

  async function persistHabitFrequency(
    habitId: string,
    frequency: 'daily' | 'weekdays',
  ) {
    if (!userId) return
    const prev = habits
    setHabits((hs) =>
      hs.map((h) => (h.id === habitId ? { ...h, frequency } : h)),
    )
    const { error } = await supabase
      .from('habits')
      .update({ frequency })
      .eq('id', habitId)
      .eq('user_id', userId)
    if (error) {
      setHabits(prev)
      setHabitActionError(error.message)
      return
    }
    closeHabitMenu()
  }

  async function persistHabitTimeOfDay(
    habitId: string,
    time_of_day: 'morning' | 'afternoon' | 'evening',
  ) {
    if (!userId) return
    const prev = habits
    setHabits((hs) =>
      hs.map((h) => (h.id === habitId ? { ...h, time_of_day } : h)),
    )
    const { error } = await supabase
      .from('habits')
      .update({ time_of_day })
      .eq('id', habitId)
      .eq('user_id', userId)
    if (error) {
      setHabits(prev)
      setHabitActionError(error.message)
      return
    }
    closeHabitMenu()
  }

  async function removeHabitConfirmed(h: TodayHabit) {
    if (!userId) return
    setConfirmDeleteHabit(null)
    setHabitActionError(null)
    setRemovingHabitIds((s) => {
      const n = new Set(s)
      n.add(h.id)
      return n
    })
    try {
      const { error: logErr } = await supabase
        .from('habit_logs')
        .delete()
        .eq('habit_id', h.id)
        .eq('user_id', userId)
      if (logErr) throw logErr
      const { error: habErr } = await supabase
        .from('habits')
        .delete()
        .eq('id', h.id)
        .eq('user_id', userId)
      if (habErr) throw habErr
      window.setTimeout(() => {
        setHabits((prev) => prev.filter((x) => x.id !== h.id))
        setRemovingHabitIds((prev) => {
          const n = new Set(prev)
          n.delete(h.id)
          return n
        })
      }, 280)
    } catch (e) {
      console.error('Delete habit failed:', e)
      setRemovingHabitIds((prev) => {
        const n = new Set(prev)
        n.delete(h.id)
        return n
      })
      setHabitActionError(
        e instanceof Error ? e.message : 'Could not delete habit',
      )
      void load()
    }
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

      const { error: uErr } = await supabase
        .from('daily_missions')
        .update({ title: nextTitle })
        .eq('id', m.id)
        .eq('user_id', userId)
      if (uErr) throw new Error(uErr.message)

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
    enqueueStreakToast('Streak reset. Start fresh today.', '#888780')
  }, [enqueueStreakToast])

  const todayPriorityBanner = (() => {
    if (loading || loadError) return null

    const incompleteCount = missions.filter((m) => !m.completed).length
    const completedTodayCount = missions.filter((m) => m.completed).length

    const showStreak =
      notificationPrefs.streakWarnings &&
      streakCurrent > 3 &&
      clockHour >= 20 &&
      incompleteCount > 0 &&
      completedTodayCount === 0 &&
      hasGoals

    if (showStreak) {
      return (
        <div
          className="inhabit-banner-fade-in mb-3 flex items-center gap-3 rounded-lg border border-[#EF9F27]/35 px-4 py-3"
          style={{
            backgroundColor: 'rgba(239, 159, 39, 0.1)',
            borderLeftWidth: 4,
            borderLeftColor: '#EF9F27',
          }}
          role="status"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold leading-snug text-white">
              🔥 {streakCurrent} day streak at risk
            </p>
            <p
              className="mt-0.5 text-[13px] font-medium leading-snug text-zinc-300"
            >
              Complete at least one mission to keep it alive
            </p>
          </div>
          <p
            className="shrink-0 text-3xl font-black tabular-nums leading-none text-[#EF9F27]"
            aria-hidden
          >
            {streakCurrent}
          </p>
        </div>
      )
    }

    const showUrgency =
      notificationPrefs.urgencyBanners &&
      hasGoals &&
      incompleteCount > 0 &&
      clockHour >= 18

    if (showUrgency) {
      const severe = clockHour >= 21
      return (
        <div
          className="inhabit-banner-fade-in mb-3 w-full rounded-lg border border-zinc-800/60 px-4 py-3"
          style={{
            backgroundColor: CARD_SURFACE,
            borderLeftWidth: 4,
            borderLeftColor: severe ? '#E24B4A' : '#FF6B35',
          }}
          role="status"
        >
          <p className="text-[13px] font-semibold leading-snug text-white">
            {severe
              ? `🚨 ${incompleteCount} mission${incompleteCount === 1 ? '' : 's'} left — midnight deadline approaching`
              : `⚡ ${incompleteCount} mission${incompleteCount === 1 ? '' : 's'} left today — don't break the streak`}
          </p>
        </div>
      )
    }

    if (reflectionNudge === 'sunday') {
      const h = clockHour
      const urgentEvening = h >= 15 && h < 21
      const lastChance = h >= 21
      const hoursLeft = Math.max(1, 24 - h)
      let title: string
      if (lastChance) {
        title = `⏰ Last chance — reflection closes in ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`
      } else if (urgentEvening) {
        title = '📝 Reflection closes at midnight — start now'
      } else {
        title = `📝 Time to reflect, ${reflectionBannerName} — anytime today works`
      }
      return (
        <div
          className={[
            'inhabit-banner-fade-in mb-3 flex items-center justify-between gap-3 rounded-lg px-4 py-3',
            lastChance ? 'border-l-4 border-[#E24B4A]' : '',
          ].join(' ')}
          style={{ backgroundColor: '#534AB7' }}
          role="status"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-snug text-white">{title}</p>
            <p className="mt-0.5 text-[13px] font-medium leading-snug text-white/80">
              You completed {reflectionWeekMissionRate ?? 0}% of your missions
              this week
            </p>
          </div>
          <Link
            to="/reflection"
            className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-[13px] font-bold text-white ring-1 ring-white/25 transition-colors hover:bg-white/25 active:scale-[0.98]"
          >
            Start →
          </Link>
        </div>
      )
    }

    if (reflectionNudge === 'missed') {
      const d = reflectionMissedDaysAgo
      const dayWord = d === 1 ? 'day' : 'days'
      return (
        <div
          className="inhabit-banner-fade-in mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 border-l-4 border-l-amber-500 bg-zinc-900/50 px-4 py-3"
          role="status"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-snug text-zinc-300">
              You skipped last week&apos;s reflection
            </p>
            <p className="mt-0.5 text-[13px] font-medium leading-snug text-zinc-500">
              Reflection was due {d} {dayWord} ago — still counts
            </p>
          </div>
          <Link
            to="/reflection"
            className="shrink-0 text-sm font-bold text-amber-200 underline-offset-2 hover:text-amber-100 hover:underline"
          >
            Reflect now →
          </Link>
        </div>
      )
    }

    if (newWeekMotivationPhase !== 'off' && notificationPrefs.newWeekBanner) {
      return (
        <div
          className={[
            'inhabit-banner-fade-in relative mb-3 flex w-full items-start gap-3 rounded-lg border border-zinc-800/60 px-4 py-3 pr-10 transition-opacity duration-300',
            newWeekMotivationPhase === 'fading' ? 'opacity-0' : 'opacity-100',
          ].join(' ')}
          style={{
            backgroundColor: CARD_SURFACE,
            borderLeftWidth: 4,
            borderLeftColor: '#534AB7',
          }}
          role="status"
        >
          <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-white">
            🗓️ New week. Fresh start. Let&apos;s go.
          </p>
          <button
            type="button"
            aria-label="Dismiss new week message"
            onClick={dismissNewWeekMotivation}
            className="absolute right-2 top-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
      )
    }

    return null
  })()

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="shrink-0 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-300">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-white">
              {headingDate}
            </h1>
            {loading ? (
              <div className="mt-2 h-4 w-40 rounded bg-[#1e1e22] mission-skeleton-shell" />
            ) : loadError ? null : total > 0 ? (
              allDone ? (
                <p className="mt-1 text-[13px] font-semibold text-emerald-400">
                  All done today!
                </p>
              ) : (
                <p
                  className="mt-1 text-[13px] font-medium"
                  style={{ color: MUTED_HEADING }}
                >
                  {doneCount} / {total} missions done today
                </p>
              )
            ) : null}
          </div>
          {streakCurrent > 0 ? (
            <p
              className="shrink-0 pt-0.5 text-base font-bold tabular-nums"
              style={streakTierTextStyle(streakCurrent)}
            >
              🔥 {streakCurrent} day streak
            </p>
          ) : null}
        </div>
      </header>
      <div
        className="mx-4 shrink-0 border-b border-zinc-800/40"
        aria-hidden
      />
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
      {/* Always mounted; StreakMilestoneModal returns null when visible is false — not wrapped in any parent condition. */}
      <StreakMilestoneModal
        visible={streakMilestoneOpen}
        streakCount={streakMilestoneCount}
        onClose={handleStreakMilestoneClose}
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
              className="inhabit-banner-fade-in rounded-lg bg-emerald-500/20 px-4 py-3 text-center text-[13px] font-bold leading-snug text-emerald-300 ring-1 ring-emerald-500/35"
              role="status"
            >
              All missions complete! Full clear bonus incoming.
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        {!loading && !loadError ? todayPriorityBanner : null}
        {!loading &&
        !loadError &&
        weeklyNewMissionsBannerPhase !== 'off' &&
        !todayPriorityBanner ? (
          <div
            className={[
              'inhabit-banner-fade-in -mx-4 mb-3 w-[calc(100%+2rem)] rounded-lg px-4 py-3 text-center text-[13px] font-bold leading-snug text-white transition-opacity duration-300',
              weeklyNewMissionsBannerPhase === 'fading' ? 'opacity-0' : 'opacity-100',
            ].join(' ')}
            style={{ backgroundColor: '#16a34a' }}
            role="status"
          >
            🔄 New missions for this week are ready!
          </div>
        ) : null}
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
          <div className="mx-auto flex max-w-lg flex-col gap-3">
            <MissionSkeleton />
            <MissionSkeleton />
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
        ) : missionRegenerating ? (
          <div className="mx-auto flex max-w-lg flex-col gap-3">
            <MissionSkeleton />
            <MissionSkeleton />
            <MissionSkeleton />
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
            <div className="-mx-4 mb-0 flex items-center gap-3 px-4">
              <span
                className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em]"
                style={{ color: MUTED_HEADING }}
              >
                Missions
              </span>
              <div className="h-px min-w-[2rem] flex-1 bg-zinc-800/50" aria-hidden />
            </div>
            <div className="mt-5 flex flex-col gap-3">
            {missions.map((m, index) => {
              const accent = getMissionBoardAccent(m.category)
              const isPressing = pressingMissionId === m.id
              const menuOpen = missionMenuOpenId === m.id
              const isEditing = editingMissionId === m.id
              const savingThis = savingMissionId === m.id
              const regeneratingThis = regeneratingMissionId === m.id
              const removing = removingMissionIds.has(m.id)
              return (
                <Fragment key={m.id}>
                  {index > 0 ? (
                    <div className="h-px shrink-0 bg-zinc-800/50" aria-hidden />
                  ) : null}
                  <div
                    className={[
                      'relative flex min-h-[64px] transform-gpu items-stretch gap-3 rounded-2xl border p-4 shadow-sm will-change-transform transition-colors hover:bg-white/[0.04]',
                      m.completed ? 'opacity-[0.45]' : 'opacity-100',
                      removing ? 'opacity-0' : '',
                      isPressing
                        ? 'scale-[0.98] transition-none'
                        : 'scale-100 transition-[transform,opacity,background-color] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.98]',
                    ].join(' ')}
                    style={{
                      backgroundColor: CARD_SURFACE,
                      borderColor: CARD_BORDER,
                    }}
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
                      className="w-[3px] shrink-0 self-stretch rounded-full"
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
                              'text-sm font-medium leading-snug text-white',
                              m.completed ? 'line-through' : '',
                            ].join(' ')}
                          >
                            {regeneratingThis ? 'Regenerating…' : m.title}
                          </p>
                        )}
                        <p
                          className="mt-1 truncate text-xs font-medium"
                          style={{ color: MUTED_HEADING }}
                        >
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
                            className="flex h-11 w-9 min-h-[44px] min-w-[36px] items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200 active:scale-[0.98]"
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
                          'flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full',
                          m.completed ? '' : 'cursor-pointer',
                        ].join(' ')}
                      >
                        {m.completed ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                            <CheckIcon small />
                          </span>
                        ) : (
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-500 bg-transparent transition-colors hover:border-zinc-400"
                            aria-hidden
                          />
                        )}
                      </button>
                    </div>
                  </div>
                </Fragment>
              )
            })}
            </div>

            {userId ? (
              <>
                <div
                  className="my-5 border-t border-zinc-800/40 pt-5"
                  aria-hidden
                />
                <section aria-labelledby="today-habits-heading">
                  <div className="-mx-4 flex items-center gap-3 px-4">
                    <h2
                      id="today-habits-heading"
                      className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em]"
                      style={{ color: MUTED_HEADING }}
                    >
                      Habits
                    </h2>
                    <div
                      className="h-px min-w-[2rem] flex-1 bg-zinc-800/50"
                      aria-hidden
                    />
                    <Link
                      to="/habits/new"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/40 text-lg font-bold text-white transition-colors hover:bg-zinc-900/60 active:scale-[0.98]"
                      aria-label="Add habit"
                    >
                      +
                    </Link>
                  </div>

                  {habitsLoading ? (
                    <div className="mt-5 space-y-3">
                      {[0, 1].map((i) => (
                        <div
                          key={i}
                          className="mission-skeleton-shell flex min-h-[64px] items-stretch gap-3 rounded-2xl border border-zinc-800/80 p-4 shadow-sm"
                        >
                          <div
                            className="w-[3px] shrink-0 self-stretch rounded-full"
                            style={{ backgroundColor: SKELETON_STRIPE }}
                            aria-hidden
                          />
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="min-w-0 flex-1 space-y-2.5">
                              <div className="h-5 w-[70%] max-w-sm rounded-md bg-black/22" />
                              <div className="h-3.5 w-[45%] max-w-[12rem] rounded-md bg-black/22" />
                            </div>
                            <div className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 rounded-full border border-zinc-700/50 bg-black/15" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : sortedVisibleHabits.length === 0 ? (
                    <div
                      className="mt-5 rounded-2xl border p-4"
                      style={{
                        backgroundColor: CARD_SURFACE,
                        borderColor: CARD_BORDER,
                      }}
                    >
                      <p
                        className="text-sm font-medium"
                        style={{ color: MUTED_HEADING }}
                      >
                        No habits yet
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 flex flex-col gap-3">
                      {habitActionError ? (
                        <p className="text-center text-sm font-medium text-red-400">
                          {habitActionError}
                        </p>
                      ) : null}
                      {sortedVisibleHabits.map((h, hi) => {
                        const accent = getMissionBoardAccent(h.category)
                        const done = h.completedToday
                        const time =
                          h.time_of_day === 'afternoon'
                            ? 'Afternoon'
                            : h.time_of_day === 'evening'
                              ? 'Evening'
                              : 'Morning'
                        const disabled = done || habitCompletingIds.has(h.id)
                        const isEditing = editingHabitId === h.id
                        const streakN = Math.max(0, h.current_streak)
                        const streakStyle =
                          streakN > 0 ? streakTierTextStyle(streakN) : null
                        const isPressing = pressingHabitId === h.id
                        const isRemoving = removingHabitIds.has(h.id)
                        return (
                          <Fragment key={h.id}>
                            {hi > 0 ? (
                              <div
                                className="h-px shrink-0 bg-zinc-800/50"
                                aria-hidden
                              />
                            ) : null}
                          <div
                            className={[
                              'relative flex min-h-[64px] transform-gpu items-stretch gap-3 rounded-2xl border p-4 shadow-sm will-change-transform transition-colors hover:bg-white/[0.04]',
                              done ? 'opacity-[0.45]' : 'opacity-100',
                              isPressing
                                ? 'scale-[0.98] transition-none'
                                : 'scale-100 transition-[transform,opacity,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]',
                              isRemoving ? 'opacity-0' : '',
                            ].join(' ')}
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
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <div className="min-w-0 flex-1">
                                {isEditing ? (
                                  <div>
                                    <label
                                      htmlFor={`habit-edit-${h.id}`}
                                      className="sr-only"
                                    >
                                      Habit name
                                    </label>
                                    <input
                                      id={`habit-edit-${h.id}`}
                                      type="text"
                                      value={habitTitleDraft}
                                      onChange={(e) =>
                                        setHabitTitleDraft(e.target.value)
                                      }
                                      disabled={savingHabitId === h.id}
                                      className="w-full rounded-xl border border-zinc-800 bg-app-surface px-3 py-2.5 text-sm font-bold text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 disabled:opacity-50"
                                    />
                                    <div className="mt-2 flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => void saveHabitTitle(h.id)}
                                        disabled={savingHabitId === h.id}
                                        className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-app-bg disabled:opacity-50"
                                      >
                                        {savingHabitId === h.id
                                          ? 'Saving…'
                                          : 'Save'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelEditHabit}
                                        disabled={savingHabitId === h.id}
                                        className="text-xs font-semibold text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline disabled:opacity-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <p
                                      className={[
                                        'truncate text-sm font-medium text-white',
                                        done ? 'line-through' : '',
                                      ].join(' ')}
                                    >
                                      {h.title}
                                    </p>
                                    <p
                                      className="mt-1 text-[11px] font-medium"
                                      style={{ color: MUTED_HEADING }}
                                    >
                                      {time}
                                    </p>
                                    {(h.frequency ?? 'daily') === 'weekdays' ? (
                                      <p className="mt-0.5 text-[11px] font-medium text-zinc-600">
                                        Weekdays
                                      </p>
                                    ) : null}
                                    {streakN > 0 && streakStyle ? (
                                      <p
                                        className="mt-1.5 text-xs font-bold tabular-nums"
                                        style={streakStyle}
                                      >
                                        🔥 {streakN}
                                      </p>
                                    ) : null}
                                  </>
                                )}
                              </div>

                              {!isEditing ? (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    data-habit-menu
                                    aria-label="Habit options"
                                    aria-expanded={habitMenuOpenId === h.id}
                                    onClick={(e) => {
                                      const nextOpen = habitMenuOpenId !== h.id
                                      if (!nextOpen) {
                                        closeHabitMenu()
                                        return
                                      }
                                      setHabitMenuPhase('main')
                                      const rect = (
                                        e.currentTarget as HTMLButtonElement
                                      ).getBoundingClientRect()
                                      const menuW = 224
                                      const menuH = 260
                                      const spaceBelow =
                                        window.innerHeight - rect.bottom
                                      const spaceAbove = rect.top
                                      const openUp =
                                        spaceBelow < menuH + 12 &&
                                        spaceAbove > spaceBelow
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
                                      setHabitMenuOpenId(h.id)
                                      setHabitMenuAnchor({
                                        id: h.id,
                                        left,
                                        top,
                                        openUp,
                                      })
                                    }}
                                    className="flex h-11 w-9 min-h-[44px] min-w-[36px] items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200 active:scale-[0.98]"
                                  >
                                    <span
                                      className="text-xl leading-none"
                                      aria-hidden
                                    >
                                      ⋯
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={disabled}
                                    onPointerDown={() => {
                                      if (done || disabled) return
                                      setPressingHabitId(h.id)
                                      window.setTimeout(() => {
                                        setPressingHabitId((prev) =>
                                          prev === h.id ? null : prev,
                                        )
                                      }, 100)
                                    }}
                                    onClick={() => {
                                      requestAnimationFrame(() => {
                                        void handleCompleteHabit(h.id)
                                      })
                                    }}
                                    aria-label={
                                      done
                                        ? 'Completed'
                                        : `Complete habit: ${h.title}`
                                    }
                                    className={[
                                      'relative flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center overflow-hidden rounded-full',
                                      disabled ? 'opacity-70' : '',
                                      done ? '' : 'cursor-pointer',
                                    ].join(' ')}
                                  >
                                    {habitCheckboxRippleId === h.id ? (
                                      <span
                                        className="habit-checkbox-ripple pointer-events-none absolute left-1/2 top-1/2 h-11 w-11 rounded-full bg-emerald-400/40"
                                        aria-hidden
                                      />
                                    ) : null}
                                    {done ? (
                                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                                        <CheckIcon small />
                                      </span>
                                    ) : (
                                      <span
                                        className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-500 bg-transparent transition-colors hover:border-zinc-400"
                                        aria-hidden
                                      />
                                    )}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          </Fragment>
                        )
                      })}
                    </div>
                  )}

                  <Link
                    to="/habits/new"
                    className="mt-5 block w-full rounded-2xl py-3.5 text-center text-sm font-bold text-white transition-opacity hover:opacity-95 active:scale-[0.98]"
                    style={{ backgroundColor: '#534AB7' }}
                  >
                    Add Habit
                  </Link>
                </section>
              </>
            ) : null}
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

      {habitMenuOpenId ? (
        <button
          type="button"
          className="fixed inset-0 z-[1001]"
          aria-label="Close habit menu"
          onClick={closeHabitMenu}
        />
      ) : null}

      {habitMenuAnchor && habitMenuOpenId === habitMenuAnchor.id ? (
        <div
          className="fixed z-[1002] w-56 overflow-hidden rounded-xl border border-zinc-800 bg-app-bg shadow-2xl"
          style={{ left: habitMenuAnchor.left, top: habitMenuAnchor.top }}
          role="menu"
        >
          {habitMenuPhase === 'main' ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const hh = habits.find((x) => x.id === habitMenuAnchor.id)
                  if (hh) beginEditHabit(hh)
                }}
                className="w-full px-4 py-3 text-left text-sm font-semibold text-white hover:bg-zinc-900/60"
              >
                Edit habit name
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setHabitMenuPhase('frequency')}
                className="w-full px-4 py-3 text-left text-sm font-semibold text-white hover:bg-zinc-900/60"
              >
                Change frequency
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setHabitMenuPhase('time')}
                className="w-full px-4 py-3 text-left text-sm font-semibold text-white hover:bg-zinc-900/60"
              >
                Change time of day
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const hh = habits.find((x) => x.id === habitMenuAnchor.id)
                  closeHabitMenu()
                  if (hh) setConfirmDeleteHabit(hh)
                }}
                className="w-full px-4 py-3 text-left text-sm font-semibold text-red-300 hover:bg-zinc-900/60"
              >
                Delete habit
              </button>
            </>
          ) : null}

          {habitMenuPhase === 'frequency' ? (
            <div className="border-t border-zinc-800/80 py-1">
              <button
                type="button"
                onClick={() => setHabitMenuPhase('main')}
                className="w-full px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 hover:bg-zinc-900/60"
              >
                ← Back
              </button>
              <p className="px-4 pb-1 pt-0.5 text-[11px] font-medium text-zinc-600">
                Frequency
              </p>
              <button
                type="button"
                onClick={() =>
                  void persistHabitFrequency(habitMenuAnchor.id, 'daily')
                }
                className="w-full px-4 py-3 text-left text-sm font-semibold text-white hover:bg-zinc-900/60"
              >
                Every day
              </button>
              <button
                type="button"
                onClick={() =>
                  void persistHabitFrequency(habitMenuAnchor.id, 'weekdays')
                }
                className="w-full px-4 py-3 text-left text-sm font-semibold text-white hover:bg-zinc-900/60"
              >
                Weekdays only
              </button>
            </div>
          ) : null}

          {habitMenuPhase === 'time' ? (
            <div className="border-t border-zinc-800/80 py-1">
              <button
                type="button"
                onClick={() => setHabitMenuPhase('main')}
                className="w-full px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 hover:bg-zinc-900/60"
              >
                ← Back
              </button>
              <p className="px-4 pb-1 pt-0.5 text-[11px] font-medium text-zinc-600">
                Time of day
              </p>
              {(
                [
                  ['morning', 'Morning'],
                  ['afternoon', 'Afternoon'],
                  ['evening', 'Evening'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() =>
                    void persistHabitTimeOfDay(habitMenuAnchor.id, val)
                  }
                  className="w-full px-4 py-3 text-left text-sm font-semibold text-white hover:bg-zinc-900/60"
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {confirmDeleteHabit ? (
        <div className="fixed inset-0 z-[1003] flex items-center justify-center px-5">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(13,13,15,0.8)' }}
            aria-label="Close delete habit confirmation"
            onClick={() => setConfirmDeleteHabit(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-800/80 bg-app-bg p-5 shadow-2xl">
            <p className="text-base font-bold text-white">
              Delete {confirmDeleteHabit.title}?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              This will remove this habit and all its history.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void removeHabitConfirmed(confirmDeleteHabit)}
                className="flex-1 rounded-xl bg-red-500 px-4 py-3.5 text-sm font-bold text-white"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteHabit(null)}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/40 px-4 py-3.5 text-sm font-bold text-zinc-300"
              >
                Keep it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
