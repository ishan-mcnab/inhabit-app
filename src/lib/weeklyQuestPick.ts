export type QuestProgressionMode = 'weekly' | 'completion'

export type PickableQuest = {
  id: string
  week_number: number
  completed: boolean
  title: string
}

export function formatUnlocksLabel(goalCreatedAt: string, weekNumber: number): string {
  const base = new Date(goalCreatedAt)
  const unlock = new Date(base)
  unlock.setDate(unlock.getDate() + (weekNumber - 1) * 7)
  const part = unlock.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `Unlocks ${part}`
}

export function isQuestLockedForMode(
  q: PickableQuest,
  sortedQuests: PickableQuest[],
  mode: QuestProgressionMode,
  currentWeekFromStart: number,
): boolean {
  if (mode === 'weekly') {
    return q.week_number > currentWeekFromStart
  }
  if (q.week_number <= 1) return false
  const prev = sortedQuests.find((x) => x.week_number === q.week_number - 1)
  return !prev?.completed
}

export function pickActiveQuest(
  quests: PickableQuest[],
  currentWeek: number,
  mode: QuestProgressionMode,
): PickableQuest | null {
  if (quests.length === 0) return null
  const sorted = [...quests].sort((a, b) => a.week_number - b.week_number)

  const locked = (q: PickableQuest) =>
    isQuestLockedForMode(q, sorted, mode, currentWeek)

  if (mode === 'completion') {
    const unlocked = sorted.filter((q) => !locked(q))
    if (unlocked.length === 0) return null
    const firstIncomplete = unlocked.find((q) => !q.completed)
    return firstIncomplete ?? unlocked[unlocked.length - 1]
  }

  const byCal = sorted.find((q) => q.week_number === currentWeek)
  if (byCal && !locked(byCal) && !byCal.completed) {
    return byCal
  }

  const unlocked = sorted.filter((q) => !locked(q))
  if (unlocked.length === 0) return null

  const firstIncomplete = unlocked.find((q) => !q.completed)
  if (firstIncomplete) return firstIncomplete

  return unlocked[unlocked.length - 1]
}
