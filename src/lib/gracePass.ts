import { supabase } from '../supabase'
import { localTodayYmd } from './streak'
import { awardXP, type AwardXpResult } from './xp'

/**
 * Client-side weekly reset: if local Monday and passes are not already 1, set to 1.
 * Only runs when the user opens the app on Monday.
 */
export async function ensureMondayGraceReset(userId: string): Promise<void> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user || user.id !== userId) {
    return
  }

  if (new Date().getDay() !== 1) {
    return
  }

  const { data: row, error: fetchErr } = await supabase
    .from('users')
    .select('grace_passes_remaining')
    .eq('id', userId)
    .maybeSingle()

  if (fetchErr || !row) {
    return
  }

  const g =
    typeof row.grace_passes_remaining === 'number' &&
    !Number.isNaN(row.grace_passes_remaining)
      ? Math.floor(row.grace_passes_remaining)
      : 0

  if (g === 1) {
    return
  }

  const { error: upErr } = await supabase
    .from('users')
    .update({ grace_passes_remaining: 1 })
    .eq('id', userId)

  if (upErr) {
    console.error('ensureMondayGraceReset: update failed', upErr)
  }
}

export type UseGracePassResult = {
  success: boolean
  newXp: number
  awardResult: AwardXpResult
}

/**
 * Spend one grace pass: -30 XP via awardXP, restore streak, set last activity to today.
 */
export async function useGracePass(
  userId: string,
  streakBeforeMiss: number,
): Promise<UseGracePassResult> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr) {
    throw new Error(`useGracePass: could not verify session — ${authErr.message}`)
  }
  if (!user || user.id !== userId) {
    throw new Error(
      'useGracePass: userId does not match the signed-in user, or there is no session',
    )
  }

  const { data: row, error: fetchErr } = await supabase
    .from('users')
    .select('grace_passes_remaining')
    .eq('id', userId)
    .maybeSingle()

  if (fetchErr) {
    throw new Error(`useGracePass: failed to load grace passes — ${fetchErr.message}`)
  }
  if (!row) {
    throw new Error('useGracePass: no user profile row found for this account')
  }

  const grace =
    typeof row.grace_passes_remaining === 'number' &&
    !Number.isNaN(row.grace_passes_remaining)
      ? Math.floor(row.grace_passes_remaining)
      : 0

  if (grace <= 0) {
    throw new Error('useGracePass: no grace passes remaining')
  }

  const restoreStreak = Math.max(0, Math.floor(streakBeforeMiss))
  const today = localTodayYmd()

  const awardResult = await awardXP(userId, -30, 'grace_pass_used')

  const newGrace = grace - 1
  const { error: upErr } = await supabase
    .from('users')
    .update({
      grace_passes_remaining: newGrace,
      current_streak: restoreStreak,
      last_activity_date: today,
    })
    .eq('id', userId)

  if (upErr) {
    throw new Error(
      `useGracePass: failed to restore streak / decrement pass — ${upErr.message}`,
    )
  }

  return {
    success: true,
    newXp: awardResult.newTotalXp,
    awardResult,
  }
}
