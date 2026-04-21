import { goalContextSliceHasAnswers } from './goalContextSlice'
import { supabase } from '../supabase'
import { generateMissions } from './generateMissions'
import {
  calculateCurrentWeekFromGoalStart,
  calculateTotalWeeks,
} from './goalProgress'
import { localWeekMondaySundayYmd } from './isoWeek'
import { getMostRecentMondayYmd } from './xp'

export type WeeklyMissionRegenResult = {
  regenerated: boolean
  goalsUpdated: number
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseYmdLocal(ymd: string): Date {
  const parts = ymd.split('-').map(Number)
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0)
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function sliceGoalContext(
  rawCtx: unknown,
  category: string,
): Record<string, unknown> | undefined {
  if (
    !rawCtx ||
    typeof rawCtx !== 'object' ||
    Array.isArray(rawCtx) ||
    !(category in (rawCtx as object))
  ) {
    return undefined
  }
  const slice = (rawCtx as Record<string, unknown>)[category]
  if (slice && typeof slice === 'object' && goalContextSliceHasAnswers(slice)) {
    return slice as Record<string, unknown>
  }
  return undefined
}

type ActiveGoalRow = {
  id: string
  title: string
  category: string | null
  target_date: string | null
  created_at: string
}

async function countMissionsForGoalInWeek(
  userId: string,
  goalId: string,
  weekMon: string,
  weekSun: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from('daily_missions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('goal_id', goalId)
    .gte('due_date', weekMon)
    .lte('due_date', weekSun)
    .not('due_date', 'is', null)
  if (error) {
    console.error('weeklyMissionReset: mission week count failed:', error)
    return null
  }
  return count ?? 0
}

async function setUserLastMissionReset(
  userId: string,
  mondayYmd: string,
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ last_mission_reset: mondayYmd })
    .eq('id', userId)
  if (error) {
    console.error('weeklyMissionReset: failed to update last_mission_reset:', error)
  }
}

/**
 * On Mondays only: if `users.last_mission_reset` is behind this week's Monday,
 * ensure each active goal has daily missions for Mon–Sun (generating via AI when missing).
 * Always stamps `last_mission_reset` after the run so failed goals are not retried every load.
 */
export async function checkAndRegenerateWeeklyMissions(
  userId: string,
): Promise<WeeklyMissionRegenResult> {
  if (new Date().getDay() !== 1) {
    return { regenerated: false, goalsUpdated: 0 }
  }

  const thisMonday = getMostRecentMondayYmd()
  const weekSun = formatLocalDate(addDays(parseYmdLocal(thisMonday), 6))

  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('last_mission_reset')
    .eq('id', userId)
    .maybeSingle()

  if (userErr) {
    console.error('weeklyMissionReset: users fetch failed:', userErr)
    return { regenerated: false, goalsUpdated: 0 }
  }

  const lastRaw = userRow?.last_mission_reset
  const last =
    typeof lastRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lastRaw)
      ? lastRaw
      : null

  if (last !== null && last >= thisMonday) {
    return { regenerated: false, goalsUpdated: 0 }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('goal_context')
    .eq('id', userId)
    .maybeSingle()

  const rawCtx = profile?.goal_context

  const { data: goals, error: goalsErr } = await supabase
    .from('goals')
    .select('id, title, category, target_date, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (goalsErr) {
    console.error('weeklyMissionReset: goals fetch failed:', goalsErr)
    await setUserLastMissionReset(userId, thisMonday)
    return { regenerated: true, goalsUpdated: 0 }
  }

  const list = (goals ?? []) as ActiveGoalRow[]
  let goalsUpdated = 0

  for (const goal of list) {
    const preCount = await countMissionsForGoalInWeek(
      userId,
      goal.id,
      thisMonday,
      weekSun,
    )
    if (preCount === null) continue
    if (preCount > 0) continue

    const category = goal.category ?? 'health_habits'
    const userContext = sliceGoalContext(rawCtx, category)

    const fallbackTarget = formatLocalDate(addDays(new Date(), 90))
    const targetDate =
      goal.target_date && goal.target_date.trim()
        ? goal.target_date.trim()
        : fallbackTarget

    const totalW = calculateTotalWeeks(targetDate)
    const currentW = calculateCurrentWeekFromGoalStart(goal.created_at)
    const batchWeek = Math.max(1, Math.min(currentW, totalW))

    let missions: Awaited<ReturnType<typeof generateMissions>>
    try {
      missions = await generateMissions(
        goal.title,
        category,
        targetDate,
        userContext,
        batchWeek,
        batchWeek,
        totalW,
      )
    } catch (e) {
      console.error(
        'weeklyMissionReset: generateMissions failed for goal',
        goal.id,
        e,
      )
      continue
    }

    const postCount = await countMissionsForGoalInWeek(
      userId,
      goal.id,
      thisMonday,
      weekSun,
    )
    if (postCount === null) continue
    if (postCount > 0) continue

    const base = parseYmdLocal(thisMonday)
    const dailyRows = missions.daily_missions.map((missionTitle, i) => ({
      goal_id: goal.id,
      user_id: userId,
      title: missionTitle,
      completed: false,
      xp_reward: 25,
      due_date: formatLocalDate(addDays(base, i)),
    }))

    const { error: insErr } = await supabase
      .from('daily_missions')
      .insert(dailyRows)

    if (insErr) {
      console.error(
        'weeklyMissionReset: daily_missions insert failed for goal',
        goal.id,
        insErr,
      )
      continue
    }

    goalsUpdated += 1
  }

  await setUserLastMissionReset(userId, thisMonday)

  return { regenerated: true, goalsUpdated }
}

/**
 * After resuming a paused goal: if this calendar week (Mon–Sun) has no
 * missions for that goal, generate the week via AI (same shape as weekly reset).
 */
export async function ensureCurrentWeekMissionsForResumedGoal(
  userId: string,
  goalId: string,
): Promise<void> {
  const { data: goalRow, error } = await supabase
    .from('goals')
    .select('id, title, category, target_date, created_at')
    .eq('id', goalId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (error || !goalRow) return

  const goal = goalRow as ActiveGoalRow
  const { mon, sun } = localWeekMondaySundayYmd(new Date())
  const preCount = await countMissionsForGoalInWeek(userId, goal.id, mon, sun)
  if (preCount === null || preCount > 0) return

  const { data: profile } = await supabase
    .from('users')
    .select('goal_context')
    .eq('id', userId)
    .maybeSingle()

  const rawCtx = profile?.goal_context
  const category = goal.category ?? 'health_habits'
  const userContext = sliceGoalContext(rawCtx, category)

  const fallbackTarget = formatLocalDate(addDays(new Date(), 90))
  const targetDate =
    goal.target_date && goal.target_date.trim()
      ? goal.target_date.trim()
      : fallbackTarget

  const totalW = calculateTotalWeeks(targetDate)
  const currentW = calculateCurrentWeekFromGoalStart(goal.created_at)
  const batchWeek = Math.max(1, Math.min(currentW, totalW))

  let missions: Awaited<ReturnType<typeof generateMissions>>
  try {
    missions = await generateMissions(
      goal.title,
      category,
      targetDate,
      userContext,
      batchWeek,
      batchWeek,
      totalW,
    )
  } catch (e) {
    console.error(
      'ensureCurrentWeekMissionsForResumedGoal: generateMissions failed',
      goalId,
      e,
    )
    return
  }

  const base = parseYmdLocal(mon)
  const dailyRows = missions.daily_missions.map((missionTitle, i) => ({
    goal_id: goal.id,
    user_id: userId,
    title: missionTitle,
    completed: false,
    xp_reward: 25,
    due_date: formatLocalDate(addDays(base, i)),
  }))

  const { error: insErr } = await supabase
    .from('daily_missions')
    .insert(dailyRows)

  if (insErr) {
    console.error(
      'ensureCurrentWeekMissionsForResumedGoal: insert failed',
      goalId,
      insErr,
    )
  }
}
