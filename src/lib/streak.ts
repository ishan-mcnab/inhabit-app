import { supabase } from '../supabase'

export type CheckStreakContext = 'mount' | 'activity'

export type CheckStreakResult = {
  currentStreak: number
  longestStreak: number
  streakIncremented: boolean
  streakReset: boolean
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function localTodayYmd(): string {
  return formatLocalYmd(new Date())
}

function localYesterdayYmd(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return formatLocalYmd(d)
}

function parseActivityDate(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const t = raw.trim().slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
  }
  return null
}

/**
 * Streak rules (local calendar dates):
 * - mount: detect missed days → reset to 0 and set last_activity to today (spec Case C).
 *   Case B (active yesterday): no DB write — streak still valid until user completes today.
 * - activity: after mission/habit completion — increment from yesterday, or first completion
 *   after mount reset (today, streak 0 → 1), or start a new streak after a gap (→ 1, streakReset if had streak).
 */
export async function checkAndUpdateStreak(
  userId: string,
  context: CheckStreakContext = 'activity',
): Promise<CheckStreakResult> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr) {
    throw new Error(`checkAndUpdateStreak: could not verify session — ${authErr.message}`)
  }
  if (!user || user.id !== userId) {
    throw new Error(
      'checkAndUpdateStreak: userId does not match the signed-in user, or there is no session',
    )
  }

  const today = localTodayYmd()
  const yesterday = localYesterdayYmd()

  const { data: row, error: fetchErr } = await supabase
    .from('users')
    .select(
      'current_streak, longest_streak, last_activity_date, grace_passes_remaining',
    )
    .eq('id', userId)
    .maybeSingle()

  if (fetchErr) {
    throw new Error(`checkAndUpdateStreak: failed to load user — ${fetchErr.message}`)
  }
  if (!row) {
    throw new Error('checkAndUpdateStreak: no user profile row found for this account')
  }

  const currentStreak =
    typeof row.current_streak === 'number' && !Number.isNaN(row.current_streak)
      ? Math.max(0, Math.floor(row.current_streak))
      : 0
  const longestStreak =
    typeof row.longest_streak === 'number' && !Number.isNaN(row.longest_streak)
      ? Math.max(0, Math.floor(row.longest_streak))
      : 0
  void row.grace_passes_remaining

  const last = parseActivityDate(row.last_activity_date)

  const returnRead = (
    cs: number,
    ls: number,
    inc: boolean,
    reset: boolean,
  ): CheckStreakResult => ({
    currentStreak: cs,
    longestStreak: ls,
    streakIncremented: inc,
    streakReset: reset,
  })

  if (context === 'mount') {
    if (last === today) {
      return returnRead(currentStreak, longestStreak, false, false)
    }
    if (last === yesterday) {
      return returnRead(currentStreak, longestStreak, false, false)
    }
    const { error: upErr } = await supabase
      .from('users')
      .update({
        current_streak: 0,
        last_activity_date: today,
      })
      .eq('id', userId)
    if (upErr) {
      throw new Error(`checkAndUpdateStreak: failed to reset streak — ${upErr.message}`)
    }
    return returnRead(0, longestStreak, false, true)
  }

  if (last === today && currentStreak > 0) {
    return returnRead(currentStreak, longestStreak, false, false)
  }

  if (last === today && currentStreak === 0) {
    const newStreak = 1
    const newLongest = Math.max(longestStreak, newStreak)
    const { error: upErr } = await supabase
      .from('users')
      .update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_activity_date: today,
      })
      .eq('id', userId)
    if (upErr) {
      throw new Error(`checkAndUpdateStreak: failed to update streak — ${upErr.message}`)
    }
    return returnRead(newStreak, newLongest, true, false)
  }

  if (last === yesterday) {
    const newStreak = currentStreak + 1
    const newLongest = Math.max(longestStreak, newStreak)
    const { error: upErr } = await supabase
      .from('users')
      .update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_activity_date: today,
      })
      .eq('id', userId)
    if (upErr) {
      throw new Error(`checkAndUpdateStreak: failed to update streak — ${upErr.message}`)
    }
    return returnRead(newStreak, newLongest, true, false)
  }

  const hadStreak = currentStreak > 0
  const newStreak = 1
  const newLongest = Math.max(longestStreak, newStreak)
  const { error: upErr } = await supabase
    .from('users')
    .update({
      current_streak: newStreak,
      longest_streak: newLongest,
      last_activity_date: today,
    })
    .eq('id', userId)
  if (upErr) {
    throw new Error(`checkAndUpdateStreak: failed to update streak — ${upErr.message}`)
  }
  return returnRead(newStreak, newLongest, true, hadStreak)
}
