import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

export type TutorialStep = {
  id: number
  icon:
    | 'BarChart2'
    | 'CheckSquare'
    | 'Zap'
    | 'Repeat'
    | 'Flag'
    | 'Sparkles'
    | 'PenLine'
    | 'Sun'
    | 'Moon'
    | 'TrendingUp'
    | 'BookOpen'
    | 'Shield'
    | 'Award'
    | 'CheckCircle2'
  tab: 'Today' | 'Goals' | 'Lifestyle' | 'Progress' | 'Profile' | null
  heading: string
  copy: string
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    icon: 'BarChart2',
    tab: 'Today',
    heading: 'Your rank & XP',
    copy: 'Every action earns XP. Fill the bar and level up. Your rank resets every Monday — earn it back every week.',
  },
  {
    id: 2,
    icon: 'CheckSquare',
    tab: 'Today',
    heading: 'Your missions',
    copy: 'AI-built around your goals. Complete them daily. Miss a day and your streak takes the hit.',
  },
  {
    id: 3,
    icon: 'Zap',
    tab: 'Today',
    heading: 'Earn XP',
    copy: 'Tap the circle on any mission to mark it done. Complete all missions in a day for a full clear bonus.',
  },
  {
    id: 4,
    icon: 'Repeat',
    tab: 'Today',
    heading: 'Your habits',
    copy: 'Daily recurring behaviors that compound over time. Track them every day. Streaks matter more than single sessions.',
  },
  {
    id: 5,
    icon: 'Flag',
    tab: 'Goals',
    heading: 'Your goals',
    copy: 'Each goal gets a 4-week quest plan and daily missions built by AI. Tap into any goal to track your weekly milestones.',
  },
  {
    id: 6,
    icon: 'Sparkles',
    tab: 'Goals',
    heading: 'Need ideas?',
    copy: 'InHabit can suggest goals based on your profile and focus areas. Tap ✨ on the Goals tab to see what fits.',
  },
  {
    id: 7,
    icon: 'PenLine',
    tab: 'Goals',
    heading: 'Build your own plan',
    copy: "Not feeling the AI plan? Choose 'I'll plan it myself' when creating a goal and write your own quests and missions.",
  },
  {
    id: 8,
    icon: 'Sun',
    tab: 'Lifestyle',
    heading: 'Morning & evening routines',
    copy: 'Build a repeatable daily routine. Add your own steps, check them off in order. Complete the full stack for bonus XP.',
  },
  {
    id: 9,
    icon: 'Moon',
    tab: 'Lifestyle',
    heading: 'Track your wellness',
    copy: 'Log sleep, water intake, and your mood and energy daily. Everything feeds into your weekly coaching insight.',
  },
  {
    id: 10,
    icon: 'TrendingUp',
    tab: 'Progress',
    heading: 'Your progress',
    copy: "XP charts, goal milestones, habit grids, and sleep trends. Everything you've built — visualized over time.",
  },
  {
    id: 11,
    icon: 'BookOpen',
    tab: 'Progress',
    heading: 'Weekly reflections',
    copy: 'Every Sunday, answer 3 questions about your week. InHabit gives you a 2-sentence coaching insight based on your actual data.',
  },
  {
    id: 12,
    icon: 'Shield',
    tab: 'Profile',
    heading: 'Your rank',
    copy: 'Recruit to Legend. Your rank is based on XP earned this week and resets every Monday. The grind never stops.',
  },
  {
    id: 13,
    icon: 'Award',
    tab: 'Profile',
    heading: 'Your stats',
    copy: 'Total XP, streak record, missions completed. Every number here is something you earned. Check your Profile to see the full picture.',
  },
  {
    id: 14,
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

