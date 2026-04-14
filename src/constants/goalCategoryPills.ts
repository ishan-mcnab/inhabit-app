/** Categories shown when creating a goal (fitness is tracked as habits, not goals). */
export const GOAL_CATEGORY_PILLS = [
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

const EXTRA_CATEGORY_DISPLAY: Record<string, { label: string; emoji: string }> = {
  fitness_consistency: {
    label: 'Fitness Consistency',
    emoji: '💪',
  },
  /** Legacy goals saved before slug rename */
  physical_fitness: {
    label: 'Physical Fitness',
    emoji: '💪',
  },
}

/** Subtle left-border color per category — matches mission board accents */
export const GOAL_CATEGORY_BORDER: Record<string, string> = {
  fitness_consistency: '#FF6B35',
  physical_fitness: '#FF6B35',
  health_habits: '#1D9E75',
  skills_growth: '#185FA5',
  building_confidence: '#534AB7',
  mental_emotional_health: '#3B6D11',
  financial_goals: '#BA7517',
}

export function getGoalCategoryDisplay(slug: string | null | undefined): {
  label: string
  emoji: string
} {
  const pill = GOAL_CATEGORY_PILLS.find((p) => p.id === slug)
  if (pill) return { label: pill.label, emoji: pill.emoji }
  if (slug && EXTRA_CATEGORY_DISPLAY[slug]) {
    return EXTRA_CATEGORY_DISPLAY[slug]
  }
  return { label: slug?.replace(/_/g, ' ') ?? 'Goal', emoji: '🎯' }
}

export function getCategoryBorderColor(slug: string | null | undefined): string {
  if (!slug) return '#3f3f46'
  return GOAL_CATEGORY_BORDER[slug] ?? '#3f3f46'
}
