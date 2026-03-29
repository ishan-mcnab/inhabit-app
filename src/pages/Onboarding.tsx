import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OnboardingContextStep } from '../components/onboarding/OnboardingContextStep'
import { ONBOARDING_CONTEXT_FIELDS } from '../constants/onboardingContextConfig'
import type { GoalContextCategoryId } from '../types/goalContext'
import { supabase } from '../supabase'

type Step = 'welcome' | 'name' | 'goals' | 'context'

const GOAL_PURPLE = '#534AB7'

const GOAL_OPTIONS = [
  {
    id: 'fitness_consistency',
    title: 'Fitness Consistency',
    emoji: '💪',
    subtitle: 'Show up. Track it. Build the habit.',
  },
  {
    id: 'health_habits',
    title: 'Health Habits',
    emoji: '🛌',
    subtitle: 'Sleep, Diet, Hydration',
  },
  {
    id: 'skills_growth',
    title: 'Skills & Growth',
    emoji: '🧠',
    subtitle: 'Career, Side Hustle, Hobbies',
  },
  {
    id: 'building_confidence',
    title: 'Building Confidence',
    emoji: '👊',
    subtitle: 'Public Speaking, Social Skills, Self-Image',
  },
  {
    id: 'mental_emotional_health',
    title: 'Mental & Emotional Health',
    emoji: '🧘',
    subtitle: 'Meditation, Journaling, Mindfulness',
  },
  {
    id: 'financial_goals',
    title: 'Financial Goals',
    emoji: '💰',
    subtitle: 'Saving, Budgeting, Income',
  },
] as const

function isGoalContextCategoryId(id: string): id is GoalContextCategoryId {
  return id in ONBOARDING_CONTEXT_FIELDS
}

function buildGoalContextPayload(
  order: string[],
  draft: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const cat of order) {
    if (!isGoalContextCategoryId(cat)) continue
    const fields = ONBOARDING_CONTEXT_FIELDS[cat]
    const src = draft[cat] ?? {}
    const obj: Record<string, string> = {}
    for (const f of fields) {
      const raw = (src[f.key] ?? '').trim()
      if (f.required) {
        obj[f.key] = raw
      } else if (raw !== '') {
        obj[f.key] = raw
      }
    }
    out[cat] = obj
  }
  return out
}

export function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [displayName, setDisplayName] = useState('')
  /** Selection order = order of context screens */
  const [selectedOrder, setSelectedOrder] = useState<string[]>([])
  const [contextIndex, setContextIndex] = useState(0)
  const [contextDraft, setContextDraft] = useState<
    Record<string, Record<string, string>>
  >({})
  const [nameError, setNameError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  const selectedSet = useMemo(() => new Set(selectedOrder), [selectedOrder])

  const redirectIfOnboarded = useCallback(async () => {
    setBootError(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setChecking(false)
      return
    }

    const { data, error } = await supabase
      .from('users')
      .select('onboarded')
      .eq('id', user.id)
      .maybeSingle()

    setChecking(false)

    if (error) {
      setBootError(error.message)
      return
    }

    if (data?.onboarded === true) {
      void navigate('/today', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    void redirectIfOnboarded()
  }, [redirectIfOnboarded])

  function toggleCategory(id: string) {
    setSelectedOrder((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      return [...prev, id]
    })
  }

  function handleNameContinue(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const trimmed = displayName.trim()
    if (!trimmed) {
      setNameError('Please enter your name')
      return
    }
    setNameError(null)
    setDisplayName(trimmed)
    setStep('goals')
  }

  function handleGoalsContinue() {
    if (selectedOrder.length === 0) return
    setFormError(null)
    setContextIndex(0)
    setStep('context')
  }

  function handleContextFieldChange(cat: string, key: string, value: string) {
    setContextDraft((prev) => ({
      ...prev,
      [cat]: { ...(prev[cat] ?? {}), [key]: value },
    }))
  }

  function handleContextBack() {
    setFormError(null)
    if (contextIndex <= 0) {
      setStep('goals')
      return
    }
    setContextIndex((i) => i - 1)
  }

  async function handleContextContinue() {
    setFormError(null)
    if (contextIndex < selectedOrder.length - 1) {
      setContextIndex((i) => i + 1)
      return
    }

    setSubmitting(true)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setSubmitting(false)
      setFormError(userError?.message ?? 'Not signed in')
      return
    }

    const goal_context = buildGoalContextPayload(selectedOrder, contextDraft)

    const { error } = await supabase.from('users').upsert(
      {
        id: user.id,
        display_name: displayName.trim(),
        goal_categories: [...selectedOrder],
        goal_context,
        onboarded: true,
      },
      { onConflict: 'id' },
    )

    setSubmitting(false)

    if (error) {
      setFormError(error.message)
      return
    }

    void navigate('/today', { replace: true })
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg">
        <p className="text-sm font-medium text-zinc-500">Loading…</p>
      </div>
    )
  }

  if (bootError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-bg px-6">
        <p className="max-w-md text-center text-sm font-medium text-red-400">
          {bootError}
        </p>
        <button
          type="button"
          onClick={() => {
            setChecking(true)
            void redirectIfOnboarded()
          }}
          className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-app-bg"
        >
          Retry
        </button>
      </div>
    )
  }

  if (step === 'welcome') {
    return (
      <div className="flex min-h-screen flex-col bg-app-bg px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
          <h1 className="text-[2.75rem] font-extrabold leading-none tracking-tight text-white sm:text-6xl">
            InHabit
          </h1>
          <p className="mt-6 max-w-sm text-lg font-semibold leading-snug text-zinc-300">
            Build the life you&apos;ve been promising yourself.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep('name')}
          className="w-full rounded-xl bg-white py-4 text-base font-bold tracking-wide text-app-bg shadow-lg shadow-black/20 transition-opacity active:opacity-90"
        >
          Get Started
        </button>
      </div>
    )
  }

  if (step === 'name') {
    return (
      <div className="flex min-h-screen flex-col bg-app-bg px-6 py-10">
        <div className="mx-auto flex w-full max-w-[22rem] flex-1 flex-col justify-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            What should we call you?
          </h1>
          <p className="mt-2 text-sm font-medium text-zinc-400">
            This is how we&apos;ll greet you in the app.
          </p>

          <form
            className="mt-10 flex flex-col gap-5"
            onSubmit={handleNameContinue}
            noValidate
          >
            <div className="flex flex-col gap-2">
              <label
                htmlFor="onboarding-display-name"
                className="text-sm font-semibold text-zinc-200"
              >
                Display name
              </label>
              <input
                id="onboarding-display-name"
                name="displayName"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(ev) => {
                  setDisplayName(ev.target.value)
                  if (nameError) setNameError(null)
                }}
                className="rounded-xl border border-zinc-800 bg-app-surface px-4 py-3.5 text-base font-medium text-white outline-none transition-[border-color,box-shadow] placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30"
                placeholder="Your name"
              />
              {nameError ? (
                <p className="text-sm font-medium text-red-400" role="alert">
                  {nameError}
                </p>
              ) : null}
            </div>

            {formError ? (
              <p className="text-sm font-medium text-red-400" role="alert">
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              className="mt-2 rounded-xl bg-white py-4 text-base font-bold tracking-wide text-app-bg transition-opacity disabled:opacity-50"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (step === 'context') {
    if (selectedOrder.length === 0) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-bg px-6">
          <p className="text-center text-sm text-zinc-500">
            Select at least one focus area to continue.
          </p>
          <button
            type="button"
            onClick={() => setStep('goals')}
            className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-app-bg"
          >
            Back to categories
          </button>
        </div>
      )
    }

    if (contextIndex < 0 || contextIndex >= selectedOrder.length) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-bg px-6">
          <p className="text-center text-sm text-zinc-500">
            Invalid step. Return to category selection.
          </p>
          <button
            type="button"
            onClick={() => {
              setContextIndex(0)
              setStep('goals')
            }}
            className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-app-bg"
          >
            Back to categories
          </button>
        </div>
      )
    }

    const catRaw = selectedOrder[contextIndex]
    if (!isGoalContextCategoryId(catRaw)) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-bg px-6">
          <p className="text-center text-sm text-zinc-500">
            Unknown category. Please go back and try again.
          </p>
          <button
            type="button"
            onClick={() => setStep('goals')}
            className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-app-bg"
          >
            Back to categories
          </button>
        </div>
      )
    }

    const categoryId = catRaw
    const meta = GOAL_OPTIONS.find((o) => o.id === categoryId)
    if (!meta) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-bg px-6">
          <button
            type="button"
            onClick={() => setStep('goals')}
            className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-app-bg"
          >
            Back to categories
          </button>
        </div>
      )
    }

    return (
      <OnboardingContextStep
        categoryId={categoryId}
        headingEmoji={meta.emoji}
        headingTitle={meta.title}
        stepNumber={contextIndex + 1}
        totalSteps={selectedOrder.length}
        values={contextDraft[categoryId] ?? {}}
        onFieldChange={(key, value) =>
          handleContextFieldChange(categoryId, key, value)
        }
        onBack={handleContextBack}
        onContinue={() => void handleContextContinue()}
        submitting={submitting}
        formError={formError}
      />
    )
  }

  const canFinish = selectedOrder.length > 0

  return (
    <div className="flex min-h-screen flex-col bg-app-bg px-5 pb-10 pt-8">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          What are you working on?
        </h1>
        <p className="mt-2 text-base font-semibold text-zinc-400">
          Pick all that apply.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3">
          {GOAL_OPTIONS.map((opt) => {
            const selected = selectedSet.has(opt.id)
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleCategory(opt.id)}
                className={[
                  'flex flex-col rounded-2xl border-2 p-3.5 text-left transition-colors',
                  'min-h-[7.5rem] active:scale-[0.98]',
                  selected
                    ? 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                    : 'border-zinc-800 bg-app-surface hover:border-zinc-700',
                ].join(' ')}
                style={
                  selected
                    ? {
                        borderColor: GOAL_PURPLE,
                        backgroundColor: 'rgba(83, 74, 183, 0.12)',
                      }
                    : undefined
                }
              >
                <span className="text-sm font-bold leading-tight text-white">
                  {opt.title}{' '}
                  <span className="text-base" aria-hidden>
                    {opt.emoji}
                  </span>
                </span>
                <span className="mt-2 text-[11px] font-medium leading-snug text-zinc-500">
                  {opt.subtitle}
                </span>
              </button>
            )
          })}
        </div>

        {formError ? (
          <p className="mt-6 text-sm font-medium text-red-400" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="mt-auto pt-10">
          <button
            type="button"
            disabled={!canFinish}
            onClick={handleGoalsContinue}
            className="w-full rounded-xl bg-white py-4 text-base font-bold tracking-wide text-app-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Let&apos;s go
          </button>
        </div>
      </div>
    </div>
  )
}
