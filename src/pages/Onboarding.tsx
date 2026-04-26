import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OnboardingContextStep } from '../components/onboarding/OnboardingContextStep'
import { ONBOARDING_CONTEXT_FIELDS } from '../constants/onboardingContextConfig'
import type { GoalContextCategoryId } from '../types/goalContext'
import { SplashScreen } from '../components/SplashScreen'
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
  draft: Record<string, Record<string, string | string[]>>,
): Record<string, Record<string, string | string[]>> {
  const out: Record<string, Record<string, string | string[]>> = {}
  for (const cat of order) {
    if (!isGoalContextCategoryId(cat)) continue
    const fields = ONBOARDING_CONTEXT_FIELDS[cat]
    const src = draft[cat] ?? {}
    const obj: Record<string, string | string[]> = {}
    for (const f of fields) {
      if (f.type === 'text') {
        const raw = String(src[f.key] ?? '').trim()
        if (f.required) {
          obj[f.key] = raw
        } else if (raw !== '') {
          obj[f.key] = raw
        }
      } else if (f.type === 'pills' && f.multiSelect) {
        const raw = src[f.key]
        const arr = Array.isArray(raw)
          ? raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
          : []
        if (f.required) {
          obj[f.key] = arr
        } else if (arr.length > 0) {
          obj[f.key] = arr
        }
      } else {
        const pillRaw = src[f.key]
        const raw = typeof pillRaw === 'string' ? pillRaw.trim() : ''
        if (f.required) {
          obj[f.key] = raw
        } else if (raw !== '') {
          obj[f.key] = raw
        }
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
    Record<string, Record<string, string | string[]>>
  >({})
  const [nameError, setNameError] = useState<string | null>(null)
  const [goalsError, setGoalsError] = useState<string | null>(null)
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
    if (goalsError) setGoalsError(null)
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

  function handleContextFieldChange(
    cat: string,
    key: string,
    value: string | string[],
  ) {
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
    if (submitting) return
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

  async function handleSkipSetupLater() {
    if (submitting) return
    setFormError(null)
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
    return <SplashScreen show />
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
      <div
        className="flex min-h-screen flex-col px-4 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(83,74,183,0.12) 0%, transparent 70%), #0D0D0F',
        }}
      >
        <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
          <div
            style={{ position: 'relative', display: 'inline-block' }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(ellipse at center, rgba(83,74,183,0.7) 0%, transparent 70%)',
                width: 280,
                height: 100,
                filter: 'blur(28px)',
                transform: 'scale(1.8)',
                zIndex: 0,
              }}
              aria-hidden
            />
            <h1
              className="text-[56px] font-bold leading-none tracking-tight text-white"
              style={{ position: 'relative', zIndex: 1 }}
            >
              InHabit
            </h1>
          </div>
          <p
            className="mx-auto mt-6 max-w-[280px] text-base font-medium leading-[1.6]"
            style={{ color: '#888780' }}
          >
            Build the life you&apos;ve been promising yourself.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep('name')}
          className="btn-press mx-auto h-[52px] w-full max-w-[320px] rounded-xl text-base font-semibold text-white transition-opacity"
          style={{ backgroundColor: GOAL_PURPLE }}
        >
          Get Started
        </button>
      </div>
    )
  }

  if (step === 'name') {
    return (
      <div
        className="flex min-h-screen flex-col px-4 py-10"
        style={{ backgroundColor: '#0D0D0F' }}
      >
        <div className="mx-auto flex w-full max-w-[22rem] flex-1 flex-col justify-center">
          <h1 className="mt-3 text-center text-2xl font-semibold tracking-tight text-white">
            What should we call you?
          </h1>
          <p
            className="mt-2 text-center text-sm font-medium"
            style={{ color: '#888780' }}
          >
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
                className="h-12 rounded-xl border px-4 text-base font-medium text-white outline-none transition-[border-color,box-shadow] placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-[#534AB7]/50"
                style={{
                  backgroundColor: '#141418',
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
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
              className="btn-press mx-auto mt-2 h-[52px] w-full max-w-[320px] rounded-xl text-base font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: GOAL_PURPLE }}
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
        onSkipSetupLater={() => void handleSkipSetupLater()}
        submitting={submitting}
        formError={formError}
      />
    )
  }

  return (
    <div
      className="flex min-h-screen flex-col px-4 pb-10 pt-8"
      style={{ backgroundColor: '#0D0D0F' }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <h1 className="text-[22px] font-semibold tracking-tight text-white">
          What are you working on?
        </h1>
        <p className="mt-2 text-sm font-medium" style={{ color: '#888780' }}>
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
                  'flex min-h-[80px] flex-col rounded-xl border p-3.5 text-left transition-colors active:scale-[0.98]',
                  selected ? '' : 'hover:bg-white/[0.02]',
                ].join(' ')}
                style={
                  selected
                    ? {
                        borderColor: GOAL_PURPLE,
                        backgroundColor: 'rgba(83, 74, 183, 0.1)',
                      }
                    : {
                        backgroundColor: '#141418',
                        borderColor: 'rgba(255,255,255,0.08)',
                      }
                }
              >
                <span className="flex items-center gap-2 leading-tight">
                  <span className="text-[28px] leading-none" aria-hidden>
                    {opt.emoji}
                  </span>
                  <span className="text-sm font-medium text-white">
                    {opt.title}
                  </span>
                </span>
                <span
                  className="mt-2 text-xs font-medium leading-snug"
                  style={{ color: '#888780' }}
                >
                  {opt.subtitle}
                </span>
              </button>
            )
          })}
        </div>

        {goalsError ? (
          <p className="mt-6 text-sm font-medium text-red-400" role="alert">
            {goalsError}
          </p>
        ) : null}

        {formError ? (
          <p className="mt-6 text-sm font-medium text-red-400" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="mt-auto pt-10">
          <button
            type="button"
            onClick={handleGoalsContinue}
            className="btn-press h-[52px] w-full rounded-xl text-base font-semibold text-white transition-opacity"
            style={{ backgroundColor: GOAL_PURPLE }}
          >
            Let&apos;s go
          </button>
        </div>
      </div>
    </div>
  )
}
