import type { GoalContextCategoryId } from '../types/goalContext'

export type ContextPillField = {
  key: string
  label: string
  type: 'pills'
  required: boolean
  /** When true, user may pick multiple pills; answer stored as string[]. */
  multiSelect?: boolean
  options: readonly string[]
}

export type ContextTextField = {
  key: string
  label: string
  type: 'text'
  required: boolean
  placeholder: string
}

export type ContextFieldConfig = ContextPillField | ContextTextField

export const ONBOARDING_CONTEXT_FIELDS: Record<
  GoalContextCategoryId,
  readonly ContextFieldConfig[]
> = {
  fitness_consistency: [
    {
      key: 'training_routine',
      label: 'Current training routine',
      type: 'pills',
      required: true,
      options: [
        'Just starting out',
        'Following a program',
        'Training regularly',
        'Very consistent',
      ],
    },
    {
      key: 'target_training_days',
      label: 'Target training days per week',
      type: 'pills',
      required: true,
      options: ['3', '4', '5', '6'],
    },
    {
      key: 'consistency_blocker',
      label: 'Biggest consistency blocker',
      type: 'pills',
      required: false,
      multiSelect: true,
      options: [
        'Motivation',
        'Time',
        'Energy',
        'No plan',
        'All of the above',
      ],
    },
    {
      key: 'training_location',
      label: 'Where do you train?',
      type: 'pills',
      required: false,
      options: ['Gym', 'Home', 'Both'],
    },
    {
      key: 'following_program',
      label: 'What program or routine are you following?',
      type: 'text',
      required: false,
      placeholder: 'e.g. PPL, 5/3/1, following a PT...',
    },
  ],
  health_habits: [
    {
      key: 'focus_area',
      label: 'Which area needs the most work?',
      type: 'pills',
      required: true,
      multiSelect: true,
      options: ['Sleep', 'Diet', 'Hydration', 'All equally'],
    },
    {
      key: 'consistency_level',
      label: 'Current consistency level',
      type: 'pills',
      required: true,
      options: [
        'All over the place',
        'Somewhat consistent',
        'Pretty consistent',
      ],
    },
    {
      key: 'constraints',
      label: 'Any constraints we should know about?',
      type: 'text',
      required: false,
      placeholder: 'e.g. vegetarian, work night shifts...',
    },
  ],
  skills_growth: [
    {
      key: 'learning_focus',
      label: 'What specifically are you learning or building?',
      type: 'text',
      required: true,
      placeholder: 'Describe your focus…',
    },
    {
      key: 'time_per_day',
      label: 'Time per day available',
      type: 'pills',
      required: true,
      options: ['15 mins', '30 mins', '1 hour', '2+ hours'],
    },
    {
      key: 'current_level',
      label: 'Current level',
      type: 'pills',
      required: false,
      options: [
        'Complete beginner',
        'Some knowledge',
        'Intermediate',
      ],
    },
    {
      key: 'resources',
      label: "Any resources or tools you're already using?",
      type: 'text',
      required: false,
      placeholder: 'e.g. Duolingo, a specific YouTube channel...',
    },
  ],
  building_confidence: [
    {
      key: 'biggest_blocker',
      label: 'Biggest confidence blocker',
      type: 'pills',
      required: true,
      multiSelect: true,
      options: [
        'Social situations',
        'Public speaking',
        'Self-image',
        'All of the above',
      ],
    },
    {
      key: 'life_stage',
      label: 'Current life stage',
      type: 'pills',
      required: true,
      options: ['In school', 'Working', 'Both', 'Neither'],
    },
    {
      key: 'confidence_level',
      label: 'Current confidence level',
      type: 'pills',
      required: false,
      options: ['Low', 'Building', 'Moderate', 'Situational'],
    },
    {
      key: 'specific_work',
      label: 'Anything specific you want to work on?',
      type: 'text',
      required: false,
      placeholder: 'e.g. talking to new people, presenting at work...',
    },
  ],
  mental_emotional_health: [
    {
      key: 'driving_factor',
      label: "What's driving this goal?",
      type: 'pills',
      required: true,
      multiSelect: true,
      options: [
        'Stress',
        'Anxiety',
        'Low mood',
        'General wellness',
        'All of the above',
      ],
    },
    {
      key: 'time_commitment',
      label: 'Time per day available',
      type: 'pills',
      required: true,
      options: ['5 mins', '10 mins', '20 mins', '30+ mins'],
    },
    {
      key: 'previous_experience',
      label: 'Previous experience with wellness practices',
      type: 'pills',
      required: false,
      options: [
        'Never tried',
        "Tried but didn't stick",
        'Currently do some',
      ],
    },
    {
      key: 'specific_address',
      label: 'Anything specific you want to address?',
      type: 'text',
      required: false,
      placeholder: 'e.g. work stress, trouble sleeping...',
    },
  ],
  financial_goals: [
    {
      key: 'main_focus',
      label: 'Main focus',
      type: 'pills',
      required: true,
      multiSelect: true,
      options: [
        'Saving money',
        'Earning more',
        'Getting out of debt',
        'Investing',
        'All of the above',
      ],
    },
    {
      key: 'current_situation',
      label: 'Current situation',
      type: 'pills',
      required: true,
      options: [
        'Student',
        'Part-time income',
        'Full-time income',
        'Variable/freelance',
      ],
    },
    {
      key: 'tracks_spending',
      label: 'Do you currently track your spending?',
      type: 'pills',
      required: false,
      options: ['Never', 'Sometimes', 'Yes consistently'],
    },
    {
      key: 'savings_target',
      label: 'Monthly savings target if you have one in mind',
      type: 'text',
      required: false,
      placeholder: 'e.g. $200/month, $500 by summer...',
    },
    {
      key: 'additional_info',
      label: 'Anything specific about your financial situation?',
      type: 'text',
      required: false,
      placeholder: 'e.g. paying off student loans, saving for a car...',
    },
  ],
}
