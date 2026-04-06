import { supabase } from '../supabase'

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function localTodayYmd(): string {
  return formatLocalYmd(new Date())
}

function localYesterdayYmd(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return formatLocalYmd(d)
}

function parseDateYmd(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const t = raw.trim().slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
  }
  return null
}

export async function updateHabitStreak(
  habitId: string,
  userId: string,
): Promise<{ newStreak: number }> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr) {
    throw new Error(
      `updateHabitStreak: could not verify session — ${authErr.message}`,
    )
  }
  if (!user || user.id !== userId) {
    throw new Error(
      'updateHabitStreak: userId does not match the signed-in user, or there is no session',
    )
  }

  const { data: row, error: fetchErr } = await supabase
    .from('habits')
    .select('current_streak, last_completed')
    .eq('id', habitId)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchErr) {
    throw new Error(
      `updateHabitStreak: failed to load habit — ${fetchErr.message}`,
    )
  }
  if (!row) {
    throw new Error('updateHabitStreak: habit not found')
  }

  const today = localTodayYmd()
  const yesterday = localYesterdayYmd()
  const last = parseDateYmd((row as Record<string, unknown>).last_completed)
  const current =
    typeof (row as Record<string, unknown>).current_streak === 'number' &&
    !Number.isNaN((row as Record<string, unknown>).current_streak)
      ? Math.max(0, Math.floor((row as Record<string, unknown>).current_streak as number))
      : 0

  if (last === today) {
    return { newStreak: current }
  }

  const next = last === yesterday ? current + 1 : 1

  const { error: upErr } = await supabase
    .from('habits')
    .update({
      current_streak: next,
      last_completed: today,
    })
    .eq('id', habitId)
    .eq('user_id', userId)

  if (upErr) {
    throw new Error(
      `updateHabitStreak: failed to update habit — ${upErr.message}`,
    )
  }

  return { newStreak: next }
}

