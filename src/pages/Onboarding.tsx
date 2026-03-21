import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

type Step = 'welcome' | 'name'

export function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [displayName, setDisplayName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

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

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const trimmed = displayName.trim()
    if (!trimmed) {
      setNameError('Please enter your name')
      return
    }
    setNameError(null)

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

    const { error } = await supabase.from('users').upsert(
      {
        id: user.id,
        display_name: trimmed,
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
          onSubmit={handleContinue}
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
            disabled={submitting}
            className="mt-2 rounded-xl bg-white py-4 text-base font-bold tracking-wide text-app-bg transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
