export type RoutineType = 'morning' | 'evening'

export function formatLocalDateYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Session key for in-progress checklist item ids (today). */
export function routineChecksStorageKey(routineId: string, ymd: string): string {
  return `inhabit_routine_checks_${routineId}_${ymd}`
}

export function loadRoutineChecksFromStorage(
  routineId: string,
  ymd: string,
): string[] {
  try {
    const raw = sessionStorage.getItem(routineChecksStorageKey(routineId, ymd))
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    return p.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

export function saveRoutineChecksToStorage(
  routineId: string,
  ymd: string,
  ids: string[],
): void {
  try {
    sessionStorage.setItem(
      routineChecksStorageKey(routineId, ymd),
      JSON.stringify(ids),
    )
  } catch {
    /* ignore quota */
  }
}

export function clearRoutineChecksStorage(routineId: string, ymd: string): void {
  try {
    sessionStorage.removeItem(routineChecksStorageKey(routineId, ymd))
  } catch {
    /* ignore */
  }
}

/** Consecutive calendar days with a log, walking back from today (or yesterday if today missing). */
export function calculateRoutineStreak(
  completedDatesYmd: string[],
  todayYmd: string,
): number {
  const set = new Set(completedDatesYmd)
  const parts = todayYmd.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0
  let cur = new Date(parts[0], parts[1] - 1, parts[2])
  cur.setHours(12, 0, 0, 0)
  if (!set.has(todayYmd)) {
    cur.setDate(cur.getDate() - 1)
  }
  let streak = 0
  for (let i = 0; i < 730; i++) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    const key = `${y}-${m}-${d}`
    if (!set.has(key)) break
    streak++
    cur.setDate(cur.getDate() - 1)
  }
  return streak
}
