/**
 * Goal progress from weekly quests: completed / total, rounded to nearest integer.
 */
export function calculateProgressPercent(
  completedQuests: number,
  totalQuests: number,
): number {
  if (totalQuests <= 0) return 0
  const raw = (completedQuests / totalQuests) * 100
  const rounded = Math.round(raw)
  return Math.min(100, Math.max(0, rounded))
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/**
 * Whole calendar days from `earlier` (inclusive start-of-day) to `later` (inclusive start-of-day).
 * `earlier` and `later` may be ISO timestamps or date strings.
 */
export function daysBetweenCalendar(
  earlier: string | Date,
  later: string | Date,
): number {
  const a = startOfLocalDay(
    typeof earlier === 'string' ? new Date(earlier) : earlier,
  )
  const b = startOfLocalDay(typeof later === 'string' ? new Date(later) : later)
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000))
}

/**
 * Weeks from goal creation to today: ceil(days / 7), minimum 1.
 * Aligns with: Math.ceil(daysBetween(created_at, today) / 7), floored at 1.
 */
export function calculateCurrentWeekFromGoalStart(createdAt: string): number {
  const days = daysBetweenCalendar(createdAt, new Date())
  return Math.max(1, Math.ceil(days / 7))
}

/**
 * Total goal length in weeks from today to target date (YYYY-MM-DD).
 * Math.ceil(daysBetween(today, targetDate) / 7), minimum 1.
 */
export function calculateTotalWeeks(targetDate: string): number {
  const parts = targetDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 1
  const target = new Date(parts[0], parts[1] - 1, parts[2])
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.max(
    0,
    Math.round((target.getTime() - today.getTime()) / 86_400_000),
  )
  return Math.max(1, Math.ceil(days / 7))
}

/** Batch ranges: [1–4], [5–8], … covering 1..totalWeeks */
export function weeklyQuestBatchRanges(totalWeeks: number): {
  start: number
  end: number
}[] {
  const ranges: { start: number; end: number }[] = []
  for (let s = 1; s <= totalWeeks; s += 4) {
    ranges.push({ start: s, end: Math.min(s + 3, totalWeeks) })
  }
  return ranges
}
