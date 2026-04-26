import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

export type TutorialTab = 'today' | 'goals' | 'lifestyle' | 'progress' | 'profile'

export type TutorialStep = {
  id: number
  tab: TutorialTab
  targetSelector: string | null
  heading: string
  copy: string
  isTabTransition?: boolean
  transitionLabel?: string
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    tab: 'today',
    targetSelector: '[data-tutorial="xp-bar"]',
    heading: 'Your rank',
    copy: 'Every action earns XP. Fill the bar, level up. Your rank resets every Monday — earn it back.',
  },
  {
    id: 2,
    tab: 'today',
    targetSelector: '[data-tutorial="missions-list"]',
    heading: 'Your missions',
    copy: 'AI-built around your goals. Complete them daily. Miss a day and your streak takes the hit.',
  },
  {
    id: 3,
    tab: 'today',
    targetSelector: '[data-tutorial="first-mission"]',
    heading: 'Mark it done',
    copy: "Tap the circle to complete a mission. That's how XP moves.",
  },
  {
    id: 4,
    tab: 'today',
    targetSelector: '[data-tutorial="habits-section"]',
    heading: 'Your habits',
    copy: 'Daily recurring behaviors. Track them every day. Streaks compound over time.',
  },
  {
    id: 5,
    tab: 'today',
    targetSelector: '[data-tutorial="lifestyle-tab"]',
    heading: 'Sleep. Water. Routines.',
    copy: 'The Lifestyle tab. Build your morning and evening routines. Log your wellness daily.',
  },
  {
    id: 6,
    tab: 'goals',
    targetSelector: '[data-tutorial="first-goal"]',
    heading: 'Your goals',
    copy: 'Each goal has its own quest plan and daily missions. Tap in to track progress.',
  },
  {
    id: 7,
    tab: 'goals',
    targetSelector: '[data-tutorial="suggest-goals"]',
    heading: 'Need ideas?',
    copy: 'InHabit can suggest goals based on your profile. Tap to see what fits.',
  },
  {
    id: 8,
    tab: 'goals',
    targetSelector: '[data-tutorial="add-goal"]',
    heading: 'Add a goal anytime',
    copy: 'New goal, new plan. InHabit builds it around you.',
  },
  {
    id: 9,
    tab: 'lifestyle',
    targetSelector: '[data-tutorial="routines-section"]',
    heading: 'Your routines',
    copy: 'Build a morning or evening routine. Customise every step. Complete the stack for bonus XP.',
  },
  {
    id: 10,
    tab: 'lifestyle',
    targetSelector: '[data-tutorial="health-trackers"]',
    heading: 'Track your wellness',
    copy: 'Sleep, water, mood. Logged here. Feeds your weekly coaching insight back.',
  },
  {
    id: 11,
    tab: 'progress',
    targetSelector: '[data-tutorial="rank-shield-progress"]',
    heading: 'Your progress',
    copy: "XP charts, goal progress, habit grids. Everything you've built, visualized.",
  },
  {
    id: 12,
    tab: 'progress',
    targetSelector: '[data-tutorial="reflections-section"]',
    heading: 'Weekly reflections',
    copy: 'Every Sunday, answer 3 questions about your week. InHabit gives you a 2-sentence coaching insight back.',
  },
  {
    id: 13,
    tab: 'profile',
    targetSelector: '[data-tutorial="rank-shield-profile"]',
    heading: 'Your rank',
    copy: 'Recruit to Legend. Resets every Monday. The grind never stops.',
  },
  {
    id: 14,
    tab: 'profile',
    targetSelector: '[data-tutorial="stats-grid"]',
    heading: 'Your stats',
    copy: "Total XP, streak, missions done. Everything you've earned is tracked here.",
  },
  {
    id: 15,
    tab: 'profile',
    targetSelector: null,
    heading: "You're set.",
    copy: 'Now go build something.',
  },
]

type TutorialState = {
  showTutorial: boolean
  currentStep: number
  loading: boolean
  onboarded: boolean
  completed: boolean
}

export function useTutorial(activeTab: TutorialTab) {
  const { session } = useAuth()
  const [state, setState] = useState<TutorialState>({
    showTutorial: false,
    currentStep: 0,
    loading: true,
    onboarded: false,
    completed: false,
  })

  const steps = useMemo(() => TUTORIAL_STEPS, [])

  const completeTutorial = useCallback(async () => {
    const userId = session?.user.id
    if (userId) {
      await supabase
        .from('users')
        .update({ tutorial_completed: true })
        .eq('id', userId)
    }
    setState((prev) => ({ ...prev, showTutorial: false, completed: true }))
  }, [session?.user.id])

  const skipTutorial = useCallback(async () => {
    await completeTutorial()
  }, [completeTutorial])

  const nextStep = useCallback(() => {
    setState((prev) => {
      const next = prev.currentStep + 1
      return { ...prev, currentStep: next }
    })
  }, [steps.length])

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setState((prev) => ({
        ...prev,
        loading: false,
        showTutorial: false,
        onboarded: false,
        completed: false,
        currentStep: 0,
      }))
      return
    }

    void (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('onboarded, tutorial_completed')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          showTutorial: false,
          onboarded: false,
          completed: false,
          currentStep: 0,
        }))
        return
      }

      const onboarded = data?.onboarded === true
      const completed = data?.tutorial_completed === true

      setState((prev) => ({
        ...prev,
        loading: false,
        showTutorial: false,
        onboarded,
        completed,
        currentStep: 0,
      }))
    })()
  }, [session?.user.id])

  useEffect(() => {
    if (state.loading) return
    if (!state.onboarded) return
    if (state.completed) return
    if (activeTab !== 'today') return
    setState((prev) => (prev.showTutorial ? prev : { ...prev, showTutorial: true }))
  }, [activeTab, state.completed, state.loading, state.onboarded])

  useEffect(() => {
    if (!state.showTutorial) return
    if (state.currentStep >= steps.length) {
      void completeTutorial()
    }
  }, [completeTutorial, state.currentStep, state.showTutorial, steps.length])

  return {
    steps,
    showTutorial: state.showTutorial,
    currentStep: state.currentStep,
    loadingTutorial: state.loading,
    nextStep,
    skipTutorial,
    completeTutorial,
  }
}

