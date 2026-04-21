import { supabase } from '../supabase'
import { localDayStartEndIso } from './xp'

export type OptimisticSleepLog = {
  bedtime: string
  wake_time: string
  rest_rating: number
  notes: string | null
}

export type OptimisticMoodLog = {
  mood_rating: number
  energy_rating: number
  notes: string | null
}

export type HealthSnapshot = {
  sleep: {
    bedtime: string | null
    wake_time: string | null
    rest_rating: number | null
    notes: string | null
  } | null
  water: {
    glasses_count: number
    daily_target: number
  } | null
  mood: {
    mood_rating: number | null
    energy_rating: number | null
    notes: string | null
  } | null
}

/** True if an xp_logs row exists for this user/reason on the local calendar day. */
export async function hasXpReasonToday(
  userId: string,
  reason: string,
): Promise<boolean> {
  const { startIso, endIso } = localDayStartEndIso()
  const { count, error } = await supabase
    .from('xp_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('reason', reason)
    .gte('created_at', startIso)
    .lte('created_at', endIso)
  if (error) {
    console.error('hasXpReasonToday:', error)
    return false
  }
  return (count ?? 0) > 0
}
