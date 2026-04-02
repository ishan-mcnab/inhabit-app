import { supabase } from '../supabase'

/** Minimum total XP required to be at level L (1-based). L=1 starts at 0. */
const LEVEL_THRESHOLDS_1_TO_10 = [
  0, 500, 1100, 1800, 2700, 3800, 5100, 6600, 8300, 10200,
] as const

const MAX_LEVEL = 50

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

  const { error: logErr } = await supabase.from('xp_logs').insert({
    user_id: userId,
    amount,
    reason,
  })

  if (logErr) {
    throw new Error(`awardXP: failed to write xp_logs — ${logErr.message}`)
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
