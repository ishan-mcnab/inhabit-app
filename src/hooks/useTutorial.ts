import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

export type TutorialStep = {
  id: number
  icon:
    | 'CalendarDays'
    | 'Flag'
    | 'Sun'
    | 'TrendingUp'
    | 'User'
    | 'CheckCircle2'
  tab: 'Today' | 'Goals' | 'Lifestyle' | 'Progress' | 'Profile' | null
  heading: string
  copy: string
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    icon: 'CalendarDays',
    tab: 'Today',
    heading: 'Your daily home base',
    copy: "Your missions and habits live here.\nComplete them each day to earn XP, build\nyour streak, and level up your rank.",
  },
  {
    id: 2,
    icon: 'Flag',
    tab: 'Goals',
    heading: 'Set a goal, get a plan',
    copy: 'Create a goal and InHabit builds\na personalized quest plan and daily\nmissions around it using AI.',
  },
  {
    id: 3,
    icon: 'Sun',
    tab: 'Lifestyle',
    heading: 'Build your daily rhythm',
    copy: 'Set up your morning and evening\nroutines, and track your sleep, water,\nand mood — all in one place.',
  },
  {
    id: 4,
    icon: 'TrendingUp',
    tab: 'Progress',
    heading: "See how far you've come",
    copy: "Your XP history, goal milestones,\nhabit consistency, and weekly reflections\nall live here.",
  },
  {
    id: 5,
    icon: 'User',
    tab: 'Profile',
    heading: 'Your rank and stats',
    copy: 'Track your total XP, streaks, and\nrank. Your rank resets every Monday —\nkeep earning it back.',
  },
  {
    id: 6,
    icon: 'CheckCircle2',
    tab: null,
    heading: "You're set.",
    copy: 'Now go build something.',
  },
]

type TutorialState = {
  showTutorial: boolean
  currentStep: number
  loading: boolean
}

export function useTutorial() {
  const { session } = useAuth()
  const [state, setState] = useState<TutorialState>({
    showTutorial: false,
    currentStep: 0,
    loading: true,
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
    setState((prev) => ({ ...prev, showTutorial: false }))
  }, [session?.user.id])

  const skipTutorial = useCallback(async () => {
    await completeTutorial()
  }, [completeTutorial])

  const nextStep = useCallback(() => {
    setState((prev) => ({ ...prev, currentStep: prev.currentStep + 1 }))
  }, [])

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setState({ showTutorial: false, currentStep: 0, loading: false })
      return
    }

    void (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('onboarded, tutorial_completed')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        setState({ showTutorial: false, currentStep: 0, loading: false })
        return
      }

      const onboarded = data?.onboarded === true
      const completed = data?.tutorial_completed === true
      setState({
        showTutorial: onboarded && !completed,
        currentStep: 0,
        loading: false,
      })
    })()
  }, [session?.user.id])

  useEffect(() => {
    if (!state.showTutorial) return
    // Show end card at index 5; auto-complete only if user advances beyond it.
    if (state.currentStep > 5) {
      void completeTutorial()
    }
  }, [completeTutorial, state.currentStep, state.showTutorial])

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

