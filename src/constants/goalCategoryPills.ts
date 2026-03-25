/** Display categories for goal creation / onboarding-style UIs */
export const GOAL_CATEGORY_PILLS = [
  { id: 'physical_fitness', label: 'Physical Fitness', emoji: '💪' },
  { id: 'health_habits', label: 'Health Habits', emoji: '🛌' },
  { id: 'skills_growth', label: 'Skills & Growth', emoji: '🧠' },
  { id: 'building_confidence', label: 'Building Confidence', emoji: '👊' },
  {
    id: 'mental_emotional_health',
    label: 'Mental & Emotional Health',
    emoji: '🧘',
  },
  { id: 'financial_goals', label: 'Financial Goals', emoji: '💰' },
] as const

export type GoalCategoryId = (typeof GOAL_CATEGORY_PILLS)[number]['id']

export const GOAL_PURPLE = '#534AB7'

/** Subtle left-border color per category for goal cards */
export const GOAL_CATEGORY_BORDER: Record<GoalCategoryId, string> = {
  physical_fitness: '#ea580c',
  health_habits: '#22c55e',
  skills_growth: '#534AB7',
  building_confidence: '#ca8a04',
  mental_emotional_health: '#8b5cf6',
  financial_goals: '#14b8a6',
}

export function getGoalCategoryDisplay(slug: string | null | undefined): {
  label: string
  emoji: string
} {
  const pill = GOAL_CATEGORY_PILLS.find((p) => p.id === slug)
  if (pill) return { label: pill.label, emoji: pill.emoji }
  return { label: slug?.replace(/_/g, ' ') ?? 'Goal', emoji: '🎯' }
}

export function getCategoryBorderColor(
  slug: string | null | undefined,
): string {
  if (!slug) return '#3f3f46'
  const key = slug as GoalCategoryId
  return GOAL_CATEGORY_BORDER[key] ?? '#3f3f46'
}
