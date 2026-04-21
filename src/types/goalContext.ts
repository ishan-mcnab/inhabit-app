/** Onboarding follow-up answers stored in users.goal_context (jsonb) */
export type GoalContext = {
  fitness_consistency?: {
    training_routine: string
    target_training_days: string
    consistency_blocker: string | string[]
    training_location: string
    following_program?: string
  }
  health_habits?: {
    focus_area: string | string[]
    consistency_level: string
    constraints?: string
  }
  skills_growth?: {
    learning_focus: string
    time_per_day: string
    current_level: string
    resources?: string
  }
  building_confidence?: {
    biggest_blocker: string | string[]
    confidence_level: string
    life_stage: string
    specific_work?: string
  }
  mental_emotional_health?: {
    driving_factor: string | string[]
    previous_experience: string
    time_commitment: string
    specific_address?: string
  }
  financial_goals?: {
    main_focus: string | string[]
    current_situation: string
    tracks_spending: string
    savings_target?: string
    additional_info?: string
  }
}

export type GoalContextCategoryId = keyof GoalContext
