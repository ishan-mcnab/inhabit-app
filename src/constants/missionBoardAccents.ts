import type { GoalCategoryId } from './goalCategoryPills'

/** Left border accents for daily mission cards (Today tab) */
export const MISSION_BOARD_ACCENT: Record<GoalCategoryId, string> = {
  physical_fitness: '#FF6B35',
  health_habits: '#1D9E75',
  skills_growth: '#185FA5',
  building_confidence: '#534AB7',
  mental_emotional_health: '#3B6D11',
  financial_goals: '#BA7517',
}

export function getMissionBoardAccent(
  slug: string | null | undefined,
): string {
  if (!slug) return '#52525b'
  const key = slug as GoalCategoryId
  return MISSION_BOARD_ACCENT[key] ?? '#52525b'
}
