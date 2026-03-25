import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  GOAL_CATEGORY_PILLS,
  GOAL_PURPLE,
  type GoalCategoryId,
} from '../constants/goalCategoryPills'
import { supabase } from '../supabase'

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

export function CreateGoal() {
  const navigate = useNavigate()
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const { minStr, maxStr, defaultStr } = useMemo(() => {
    const min = today
    const max = addDays(today, 90)
    const def = addDays(today, 30)
    return {
      minStr: formatLocalDate(min),
      maxStr: formatLocalDate(max),
      defaultStr: formatLocalDate(def),
    }
  }, [today])

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<GoalCategoryId | null>(null)
  const [targetDate, setTargetDate] = useState(defaultStr)
  const [description, setDescription] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const successNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (successNavTimerRef.current !== null) {
        clearTimeout(successNavTimerRef.current)
      }
    }
  }, [])

  function selectCategory(id: GoalCategoryId) {
    setCategoryId(id)
    if (categoryError) setCategoryError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const trimmedTitle = title.trim()
    let valid = true
    if (!trimmedTitle) {
      setTitleError('Add a goal title')
      valid = false
    } else {
      setTitleError(null)
    }
    if (!categoryId) {
      setCategoryError('Choose a category')
      valid = false
    } else {
      setCategoryError(null)
    }
    if (!valid) return

    setSaving(true)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setSaving(false)
      setFormError(userError?.message ?? 'Not signed in')
      return
    }

    const descTrimmed = description.trim()
    const { error } = await supabase.from('goals').insert({
      user_id: user.id,
      title: trimmedTitle,
      category: categoryId,
      description: descTrimmed.length > 0 ? descTrimmed : null,
      target_date: targetDate,
      progress_percent: 0,
      status: 'active',
    })

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setSaveSuccess(true)
    successNavTimerRef.current = setTimeout(() => {
      successNavTimerRef.current = null
      void navigate('/goals', { replace: true })
    }, 900)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to="/goals"
          className="text-sm font-semibold text-zinc-400 transition-colors hover:text-white"
        >
          Cancel
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-white">
          New goal
        </h1>
        <span className="w-14" aria-hidden />
      </header>

      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-6">
          <div className="mx-auto max-w-lg">
            <label
              htmlFor="goal-title"
              className="text-sm font-semibold text-zinc-200"
            >
              Goal title
            </label>
            <input
              id="goal-title"
              name="title"
              type="text"
              value={title}
              onChange={(ev) => {
                setTitle(ev.target.value)
                if (titleError) setTitleError(null)
              }}
              placeholder="What's your goal?"
              disabled={saving || saveSuccess}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-app-surface px-4 py-3.5 text-base font-medium text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 disabled:opacity-50"
            />
            {titleError ? (
              <p className="mt-2 text-sm font-medium text-red-400" role="alert">
                {titleError}
              </p>
            ) : null}

            <p className="mt-8 text-sm font-semibold text-zinc-200">Category</p>
            <div
              className="mt-3 grid grid-cols-2 gap-2.5"
              role="group"
              aria-label="Goal category"
            >
              {GOAL_CATEGORY_PILLS.map((pill) => {
                const selected = categoryId === pill.id
                return (
                  <button
                    key={pill.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={saving || saveSuccess}
                    onClick={() => selectCategory(pill.id)}
                    className={[
                      'rounded-full border-2 px-3 py-3 text-left text-sm font-bold leading-tight text-white transition-colors',
                      'min-h-[3rem] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
                      selected ? '' : 'border-zinc-800 bg-app-surface hover:border-zinc-700',
                    ].join(' ')}
                    style={
                      selected
                        ? {
                            borderColor: GOAL_PURPLE,
                            backgroundColor: 'rgba(83, 74, 183, 0.14)',
                          }
                        : undefined
                    }
                  >
                    {pill.label}{' '}
                    <span className="text-base" aria-hidden>
                      {pill.emoji}
                    </span>
                  </button>
                )
              })}
            </div>
            {categoryError ? (
              <p className="mt-2 text-sm font-medium text-red-400" role="alert">
                {categoryError}
              </p>
            ) : null}

            <label
              htmlFor="goal-target-date"
              className="mt-8 block text-sm font-semibold text-zinc-200"
            >
              Target date
            </label>
            <input
              id="goal-target-date"
              name="targetDate"
              type="date"
              min={minStr}
              max={maxStr}
              value={targetDate}
              onChange={(ev) => setTargetDate(ev.target.value)}
              disabled={saving || saveSuccess}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-app-surface px-4 py-3.5 text-base font-medium text-white outline-none focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 [color-scheme:dark] disabled:opacity-50"
            />
            <p className="mt-1.5 text-xs font-medium text-zinc-500">
              Up to 90 days from today
            </p>

            <label
              htmlFor="goal-description"
              className="mt-8 block text-sm font-semibold text-zinc-200"
            >
              Description{' '}
              <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="goal-description"
              name="description"
              rows={4}
              value={description}
              onChange={(ev) => setDescription(ev.target.value)}
              placeholder="Describe your goal..."
              disabled={saving || saveSuccess}
              className="mt-2 w-full resize-none rounded-xl border border-zinc-800 bg-app-surface px-4 py-3.5 text-base font-medium text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 disabled:opacity-50"
            />

            {formError ? (
              <p
                className="mt-6 text-sm font-medium text-red-400"
                role="alert"
              >
                {formError}
              </p>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-800/60 bg-app-bg px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-lg">
            {saveSuccess ? (
              <p
                className="w-full rounded-xl bg-emerald-500/15 py-4 text-center text-base font-bold tracking-wide text-emerald-400 ring-1 ring-emerald-500/40"
                role="status"
              >
                Goal created
              </p>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-white py-4 text-base font-bold tracking-wide text-app-bg shadow-lg shadow-black/20 transition-opacity active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create Goal'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
