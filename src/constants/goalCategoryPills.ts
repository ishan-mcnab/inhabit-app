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
