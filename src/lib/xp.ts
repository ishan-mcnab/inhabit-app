import { supabase } from '../supabase'

/** Minimum total XP required to be at level L (1-based). L=1 starts at 0. */
const LEVEL_THRESHOLDS_1_TO_10 = [
  0, 500, 1100, 1800, 2700, 3800, 5100, 6600, 8300, 10200,
] as const

export const MAX_LEVEL = 50

function minXpForLevel(level: number): number {
  if (level <= 1) return 0
  if (level <= 10) {
    return LEVEL_THRESHOLDS_1_TO_10[level - 1]
  }
  if (level > MAX_LEVEL) {
    return LEVEL_THRESHOLDS_1_TO_10[9] + (MAX_LEVEL - 10) * 1200
  }
  return LEVEL_THRESHOLDS_1_TO_10[9] + (level - 10) * 1200
}

export function calculateLevel(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp))
  const min50 = minXpForLevel(50)
  if (xp >= min50) return MAX_LEVEL
  for (let L = MAX_LEVEL - 1; L >= 1; L--) {
    if (xp >= minXpForLevel(L)) return L
  }
  return 1
}

export function xpForNextLevel(currentLevel: number): number {
  if (currentLevel >= MAX_LEVEL) return Infinity
  return minXpForLevel(currentLevel + 1)
}

/** XP required to complete the current level segment (denominator for "n / m XP"). */
export function xpSpanInCurrentLevel(level: number): number {
  if (level >= MAX_LEVEL) return 1
  return minXpForLevel(level + 1) - minXpForLevel(level)
}

export function xpProgressInCurrentLevel(totalXp: number): number {
  const xp = Math.max(0, totalXp)
  const L = calculateLevel(xp)
  const start = minXpForLevel(L)
  return Math.max(0, xp - start)
}

export function xpPercentToNextLevel(totalXp: number): number {
  const xp = Math.max(0, totalXp)
  const L = calculateLevel(xp)
  if (L >= MAX_LEVEL) return 100
  const start = minXpForLevel(L)
  const nextTotal = minXpForLevel(L + 1)
  const span = nextTotal - start
  if (span <= 0) return 100
  const progress = xp - start
  return Math.min(100, Math.max(0, Math.round((progress / span) * 100)))
}

export function calculateRank(weeklyXp: number): string {
  const w = Math.max(0, weeklyXp)
  if (w < 300) return 'Recruit'
  if (w < 600) return 'Soldier'
  if (w < 1000) return 'Warrior'
  if (w < 1500) return 'Elite'
  return 'Legend'
}

/** Weekly XP needed to reach the next tier (undefined if already Legend). */
export function weeklyXpThresholdForNextRank(weeklyXp: number): number | null {
  const w = Math.max(0, weeklyXp)
  if (w < 300) return 300
  if (w < 600) return 600
  if (w < 1000) return 1000
  if (w < 1500) return 1500
  return null
}

/** Name of the next rank tier, or null if Legend. */
export function nextRankNameFromWeeklyXp(weeklyXp: number): string | null {
  const w = Math.max(0, weeklyXp)
  if (w < 300) return 'Soldier'
  if (w < 600) return 'Warrior'
  if (w < 1000) return 'Elite'
  if (w < 1500) return 'Legend'
  return null
}

/** XP still needed this week to hit the next rank (null if Legend). */
export function weeklyXpRemainingToNextRank(weeklyXp: number): number | null {
  const cap = weeklyXpThresholdForNextRank(weeklyXp)
  if (cap === null) return null
  return Math.max(0, cap - Math.max(0, weeklyXp))
}

export type WeeklyRankBandProgressResult =
  | { kind: 'legend' }
  | {
      kind: 'band'
      bandLow: number
      bandHigh: number
      bandSize: number
      /** XP earned within the current tier band (toward `nextRank`). */
      progressInBand: number
      nextRank: string
      /** 0–100: progress through this band only. */
      percent: number
    }

/**
 * Progress within the current weekly rank band only (not from 0).
 * Recruit 0–300, Soldier 300–600, Warrior 600–1000, Elite 1000–1500, Legend capped.
 */
export function getWeeklyRankBandProgress(
  weeklyXp: number,
): WeeklyRankBandProgressResult {
  const w = Math.max(0, Math.floor(weeklyXp))
  if (w >= 1500) {
    return { kind: 'legend' }
  }
  if (w >= 1000) {
    const bandLow = 1000
    const bandSize = 500
    const progressInBand = w - bandLow
    return {
      kind: 'band',
      bandLow,
      bandHigh: 1500,
      bandSize,
      progressInBand,
      nextRank: 'Legend',
      percent: Math.min(100, (progressInBand / bandSize) * 100),
    }
  }
  if (w >= 600) {
    const bandLow = 600
    const bandSize = 400
    const progressInBand = w - bandLow
    return {
      kind: 'band',
      bandLow,
      bandHigh: 1000,
      bandSize,
      progressInBand,
      nextRank: 'Elite',
      percent: Math.min(100, (progressInBand / bandSize) * 100),
    }
  }
  if (w >= 300) {
    const bandLow = 300
    const bandSize = 300
    const progressInBand = w - bandLow
    return {
      kind: 'band',
      bandLow,
      bandHigh: 600,
      bandSize,
      progressInBand,
      nextRank: 'Warrior',
      percent: Math.min(100, (progressInBand / bandSize) * 100),
    }
  }
  const bandSize = 300
  return {
    kind: 'band',
    bandLow: 0,
    bandHigh: 300,
    bandSize,
    progressInBand: w,
    nextRank: 'Soldier',
    percent: Math.min(100, (w / bandSize) * 100),
  }
}

/**
 * Progress within the current weekly rank band (0–100), for a bar to the next tier.
 */
export function weeklyRankBandProgressPercent(weeklyXp: number): number {
  const p = getWeeklyRankBandProgress(weeklyXp)
  if (p.kind === 'legend') return 100
  return p.percent
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Start of the current ISO week (Monday) in local time, as YYYY-MM-DD. */
export function getMostRecentMondayYmd(): string {
  const d = new Date()
  const day = d.getDay()
  const daysFromMonday = (day + 6) % 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - daysFromMonday)
  return formatLocalYmd(mon)
}

/**
 * Local calendar day bounds as ISO strings for timestamptz range queries.
 * `setHours` uses the device timezone; `toISOString` maps to UTC for PostgREST.
 */
export function localDayStartEndIso(date: Date = new Date()): {
  startIso: string
  endIso: string
} {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

/** Monday 00:00:00 — Sunday 23:59:59.999 in local time, as ISO strings. */
export function localWeekStartEndIso(date: Date = new Date()): {
  startIso: string
  endIso: string
} {
  const day = date.getDay()
  const daysFromMonday = (day + 6) % 7
  const monday = new Date(date)
  monday.setDate(date.getDate() - daysFromMonday)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { startIso: monday.toISOString(), endIso: sunday.toISOString() }
}

const XP_LOG_REASON_LABELS: Record<string, string> = {
  mission_complete: 'Mission completed',
  full_clear_bonus: 'Full clear bonus',
  weekly_quest_complete: 'Weekly quest',
  grace_pass_used: 'Grace pass used',
  streak_milestone: 'Streak milestone',
  weekly_reflection: 'Weekly reflection',
  reflection_streak: 'Reflection streak',
  routine_complete: 'Routine completed',
  sleep_logged: 'Sleep logged',
  water_goal_reached: 'Water goal reached',
  mood_logged: 'Mood check-in',
}

export function formatXpLogReason(reason: string): string {
  return XP_LOG_REASON_LABELS[reason] ?? reason.replace(/_/g, ' ')
}

function parseUserDate(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const t = raw.trim().slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
  }
  return null
}

/**
 * If the user has not had a weekly reset since the current week’s Monday,
 * zero weekly XP, set rank to Recruit, and stamp last_weekly_reset to today (local).
 */
export async function checkAndResetWeeklyXp(userId: string): Promise<void> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr) {
    throw new Error(`checkAndResetWeeklyXp: could not verify session — ${authErr.message}`)
  }
  if (!user || user.id !== userId) {
    throw new Error(
      'checkAndResetWeeklyXp: userId does not match the signed-in user, or there is no session',
    )
  }

  const weekMonday = getMostRecentMondayYmd()
  const today = formatLocalYmd(new Date())

  const { data: row, error: fetchErr } = await supabase
    .from('users')
    .select('weekly_xp, last_weekly_reset')
    .eq('id', userId)
    .maybeSingle()

  if (fetchErr) {
    throw new Error(`checkAndResetWeeklyXp: failed to load user — ${fetchErr.message}`)
  }
  if (!row) {
    throw new Error('checkAndResetWeeklyXp: no user profile row found for this account')
  }

  const last = parseUserDate(row.last_weekly_reset)
  const needsReset = last === null || last < weekMonday

  if (!needsReset) {
    return
  }

  const { error: upErr } = await supabase
    .from('users')
    .update({
      weekly_xp: 0,
      rank: 'Recruit',
      last_weekly_reset: today,
    })
    .eq('id', userId)

  if (upErr) {
    throw new Error(`checkAndResetWeeklyXp: failed to update user — ${upErr.message}`)
  }
}

export function rankColor(rank: string): string {
  switch (rank) {
    case 'Recruit':
      return '#888780'
    case 'Soldier':
      return '#639922'
    case 'Warrior':
      return '#185FA5'
    case 'Elite':
      return '#BA7517'
    case 'Legend':
      return '#534AB7'
    default:
      return '#888780'
  }
}

export type AwardXpResult = {
  newTotalXp: number
  newWeeklyXp: number
  newLevel: number
  leveledUp: boolean
  newRank: string
  rankChanged: boolean
}

export async function awardXP(
  userId: string,
  amount: number,
  reason: string,
): Promise<AwardXpResult> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr) {
    throw new Error(`awardXP: could not verify session — ${authErr.message}`)
  }
  if (!user || user.id !== userId) {
    throw new Error(
      'awardXP: userId does not match the signed-in user, or there is no session',
    )
  }

  const { data: row, error: fetchErr } = await supabase
    .from('users')
    .select('total_xp, weekly_xp')
    .eq('id', userId)
    .maybeSingle()

  if (fetchErr) {
    throw new Error(`awardXP: failed to load user XP — ${fetchErr.message}`)
  }
  if (!row) {
    throw new Error('awardXP: no user profile row found for this account')
  }

  const currentTotal =
    typeof row.total_xp === 'number' && !Number.isNaN(row.total_xp)
      ? row.total_xp
      : 0
  const currentWeekly =
    typeof row.weekly_xp === 'number' && !Number.isNaN(row.weekly_xp)
      ? row.weekly_xp
      : 0
  const newTotalXp = Math.max(0, currentTotal + amount)
  const newWeeklyXp = Math.max(0, currentWeekly + amount)
  const previousLevel = calculateLevel(currentTotal)
  const previousRank = calculateRank(currentWeekly)
  const newLevel = calculateLevel(newTotalXp)
  const newRank = calculateRank(newWeeklyXp)
  const leveledUp = newLevel > previousLevel
  const rankChanged = newRank !== previousRank

  const { error: updateErr } = await supabase
    .from('users')
    .update({
      total_xp: newTotalXp,
      weekly_xp: newWeeklyXp,
      level: newLevel,
      rank: newRank,
    })
    .eq('id', userId)

  if (updateErr) {
    throw new Error(`awardXP: failed to update user XP — ${updateErr.message}`)
  }

  // xp_logs.reason (app): mission_complete, full_clear_bonus, weekly_quest_complete,
  // grace_pass_used, streak_milestone, habit_complete; weekly_reflection reserved.
  const { error: logErr } = await supabase.from('xp_logs').insert({
    user_id: userId,
    amount,
    reason,
  })

  if (logErr) {
    throw new Error(`awardXP: failed to write xp_logs — ${logErr.message}`)
  }

  if (
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('inhabit_debug') === 'true'
  ) {
    const sign = amount >= 0 ? '+' : ''
    console.log(
      `[XP] ${sign}${amount} for ${reason} → total: ${newTotalXp}, level: ${newLevel}, rank: ${newRank}`,
    )
  }

  return {
    newTotalXp,
    newWeeklyXp,
    newLevel,
    leveledUp,
    newRank,
    rankChanged,
  }
}

/*
TEST - uncomment to verify:
console.log(calculateLevel(0))     // should be 1
console.log(calculateLevel(500))   // should be 2
console.log(calculateLevel(1099))  // should be 2
console.log(calculateLevel(1100))  // should be 3
console.log(calculateLevel(10200)) // should be 10
console.log(calculateRank(0))      // should be Recruit
console.log(calculateRank(299))    // should be Recruit
console.log(calculateRank(300))    // should be Soldier
console.log(calculateRank(1500))   // should be Legend
*/
