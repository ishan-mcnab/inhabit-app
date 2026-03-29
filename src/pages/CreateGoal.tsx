import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  GOAL_CATEGORY_PILLS,
  GOAL_PURPLE,
  type GoalCategoryId,
} from '../constants/goalCategoryPills'
import { generateMissions } from '../lib/generateMissions'
import { supabase } from '../supabase'

type DurationPresetId = '1m' | '3m' | '6m' | '1y'

const DURATION_PRESET_DAYS: Record<DurationPresetId, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 182,
  '1y': 365,
}

const DURATION_PILL_OPTIONS: { id: DurationPresetId; label: string }[] = [
  { id: '1m', label: '1 Month' },
  { id: '3m', label: '3 Months' },
  { id: '6m', label: '6 Months' },
  { id: '1y', label: '1 Year' },
]

type CreateGoalPrefill = {
  title?: string
  category?: string
  description?: string
  suggestedDuration?: string
}

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

function parseIsoLocal(iso: string): Date {
  const parts = iso.split('-').map(Number)
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  d.setHours(0, 0, 0, 0)
  return d
}

function durationWeeksBetween(today: Date, targetIso: string): number {
  const end = parseIsoLocal(targetIso)
  const ms = end.getTime() - today.getTime()
  return Math.max(1, Math.ceil(ms / (7 * 86_400_000)))
}

function clampDateStr(iso: string, minIso: string, maxIso: string): string {
  const t = parseIsoLocal(iso).getTime()
  const a = parseIsoLocal(minIso).getTime()
  const b = parseIsoLocal(maxIso).getTime()
  const c = Math.min(b, Math.max(a, t))
  return formatLocalDate(new Date(c))
}

function formatTargetConfirmationLabel(iso: string): string {
  return parseIsoLocal(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function durationFromSuggestion(text: string | undefined): {
  preset: DurationPresetId | null
  days: number
} {
  if (!text?.trim()) return { preset: '1m', days: DURATION_PRESET_DAYS['1m'] }
  const t = text.toLowerCase()
  if (/\b1\s*year\b|\b12\s*months?\b/.test(t))
    return { preset: '1y', days: DURATION_PRESET_DAYS['1y'] }
  if (/\b6\s*months?\b/.test(t))
    return { preset: '6m', days: DURATION_PRESET_DAYS['6m'] }
  if (/\b3\s*months?\b/.test(t))
    return { preset: '3m', days: DURATION_PRESET_DAYS['3m'] }
  if (/\b1\s*month\b/.test(t))
    return { preset: '1m', days: DURATION_PRESET_DAYS['1m'] }
  const m = t.match(/(\d+)\s*months?/)
  if (m) {
    const n = parseInt(m[1], 10)
    const days = Math.min(365 * 3 - 7, Math.max(7, n * 30))
    return { preset: null, days }
  }
  return { preset: '3m', days: DURATION_PRESET_DAYS['3m'] }
}

type SubmitPhase =
  | 'idle'
  | 'saving_goal'
  | 'generating'
  | 'saving_missions'
  | 'success'
  | 'partial_done'

function submitButtonLabel(phase: SubmitPhase): string {
  switch (phase) {
    case 'saving_goal':
      return 'Saving...'
    case 'generating':
      return 'Building your plan...'
    case 'saving_missions':
      return 'Saving missions...'
    case 'success':
      return 'Goal created!'
    case 'partial_done':
      return 'Goal saved!'
    default:
      return 'Create Goal'
  }
}

export function CreateGoal() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefillConsumed = useRef(false)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const customMinStr = useMemo(
    () => formatLocalDate(addDays(today, 7)),
    [today],
  )
  const customMaxStr = useMemo(
    () => formatLocalDate(addDays(today, 365 * 3)),
    [today],
  )

  const [durationMode, setDurationMode] = useState<'preset' | 'custom'>(
    'preset',
  )
  const [durationPreset, setDurationPreset] = useState<DurationPresetId>('1m')
  const [targetDate, setTargetDate] = useState(() =>
    formatLocalDate(addDays(today, 30)),
  )

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<GoalCategoryId | null>(null)
  const [description, setDescription] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [infoBanner, setInfoBanner] = useState<string | null>(null)
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle')
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (durationMode !== 'preset') return
    setTargetDate(
      formatLocalDate(addDays(today, DURATION_PRESET_DAYS[durationPreset])),
    )
  }, [durationMode, durationPreset, today])

  useEffect(() => {
    if (prefillConsumed.current) return
    const raw = location.state as { createGoalPrefill?: CreateGoalPrefill } | null
    const p = raw?.createGoalPrefill
    if (!p) return
    prefillConsumed.current = true
    if (p.title) setTitle(p.title)
    if (p.description) setDescription(p.description)
    if (
      p.category &&
      GOAL_CATEGORY_PILLS.some((x) => x.id === p.category)
    ) {
      setCategoryId(p.category as GoalCategoryId)
    }
    const { preset, days } = durationFromSuggestion(p.suggestedDuration)
    if (preset !== null) {
      setDurationMode('preset')
      setDurationPreset(preset)
      setTargetDate(
        formatLocalDate(addDays(today, DURATION_PRESET_DAYS[preset])),
      )
    } else {
      setDurationMode('custom')
      setTargetDate(
        clampDateStr(
          formatLocalDate(addDays(today, days)),
          customMinStr,
          customMaxStr,
        ),
      )
    }
    void navigate('.', { replace: true, state: {} })
  }, [
    location.state,
    navigate,
    today,
    customMinStr,
    customMaxStr,
  ])

  const formLocked =
    submitPhase === 'saving_goal' ||
    submitPhase === 'generating' ||
    submitPhase === 'saving_missions' ||
    submitPhase === 'success' ||
    submitPhase === 'partial_done'

  useEffect(() => {
    return () => {
      if (navTimerRef.current !== null) {
        clearTimeout(navTimerRef.current)
      }
      prefillConsumed.current = false
    }
  }, [])

  function scheduleNavigateGoals(delayMs: number) {
    if (navTimerRef.current !== null) {
      clearTimeout(navTimerRef.current)
    }
    navTimerRef.current = setTimeout(() => {
      navTimerRef.current = null
      void navigate('/goals', { replace: true })
    }, delayMs)
  }

  function selectCategory(id: GoalCategoryId) {
    setCategoryId(id)
    if (categoryError) setCategoryError(null)
  }

  function selectPreset(id: DurationPresetId) {
    setDurationMode('preset')
    setDurationPreset(id)
  }

  function selectCustomMode() {
    setDurationMode('custom')
    setTargetDate((prev) =>
      clampDateStr(prev, customMinStr, customMaxStr),
    )
  }

  function goPartialSuccess() {
    setInfoBanner('Goal saved! Missions will generate shortly.')
    setSubmitPhase('partial_done')
    scheduleNavigateGoals(1600)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setInfoBanner(null)

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
    if (!valid || !categoryId) return

    const category = categoryId
    const durationWeeks = durationWeeksBetween(today, targetDate)

    setSubmitPhase('saving_goal')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setSubmitPhase('idle')
      setFormError(userError?.message ?? 'Not signed in')
      return
    }

    const descTrimmed = description.trim()
    console.log('Starting goal save...')
    const { data: goalRow, error: goalError } = await supabase
      .from('goals')
      .insert({
        user_id: user.id,
        title: trimmedTitle,
        category,
        description: descTrimmed.length > 0 ? descTrimmed : null,
        target_date: targetDate,
        progress_percent: 0,
        status: 'active',
      })
      .select('id')
      .single()

    if (goalError || !goalRow?.id) {
      setSubmitPhase('idle')
      setFormError(goalError?.message ?? 'Failed to save goal')
      return
    }

    const goalId = goalRow.id
    console.log('Goal saved, id:', goalId)

    setSubmitPhase('generating')

    console.log('Fetching user context...')
    const { data: profile } = await supabase
      .from('users')
      .select('goal_context')
      .eq('id', user.id)
      .maybeSingle()

    let userContext: Record<string, unknown> | undefined
    const rawCtx = profile?.goal_context
    if (
      rawCtx &&
      typeof rawCtx === 'object' &&
      !Array.isArray(rawCtx) &&
      category in (rawCtx as object)
    ) {
      const slice = (rawCtx as Record<string, unknown>)[category]
      if (
        slice &&
        typeof slice === 'object' &&
        !Array.isArray(slice) &&
        Object.values(slice as Record<string, unknown>).some(
          (v) => typeof v === 'string' && v.trim().length > 0,
        )
      ) {
        userContext = slice as Record<string, unknown>
      }
    }

    if (userContext !== undefined) {
      console.log('User context found:', userContext)
    } else {
      console.log('No context found')
    }

    console.log('Calling generateMissions with:', [
      trimmedTitle,
      category,
      targetDate,
      durationWeeks,
      userContext,
    ])

    let missions: Awaited<ReturnType<typeof generateMissions>>
    try {
      missions = await generateMissions(
        trimmedTitle,
        category,
        targetDate,
        durationWeeks,
        userContext,
      )
    } catch (err) {
      console.error('generateMissions threw:', err)
      goPartialSuccess()
      return
    }

    console.log('Missions generated:', missions)

    setSubmitPhase('saving_missions')

    const base = new Date()
    base.setHours(0, 0, 0, 0)

    const weeklyRows = missions.weekly_quests.map((questTitle, i) => ({
      goal_id: goalId,
      user_id: user.id,
      title: questTitle,
      week_number: i + 1,
      completed: false,
      xp_reward: 150,
    }))

    console.log('Saving weekly quests...')
    const { error: weeklyError } = await supabase
      .from('weekly_quests')
      .insert(weeklyRows)

    if (weeklyError) {
      goPartialSuccess()
      return
    }

    const dailyRows = missions.daily_missions.map((missionTitle, i) => ({
      goal_id: goalId,
      user_id: user.id,
      title: missionTitle,
      completed: false,
      xp_reward: 25,
      due_date: formatLocalDate(addDays(base, i)),
    }))

    console.log('Saving daily missions...')
    const { error: dailyError } = await supabase
      .from('daily_missions')
      .insert(dailyRows)

    if (dailyError) {
      goPartialSuccess()
      return
    }

    setSubmitPhase('success')
    scheduleNavigateGoals(900)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to="/goals"
          className={[
            'text-sm font-semibold text-zinc-400 transition-colors hover:text-white',
            formLocked ? 'pointer-events-none opacity-40' : '',
          ].join(' ')}
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
              disabled={formLocked}
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
                    disabled={formLocked}
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

            <p className="mt-8 text-sm font-semibold text-zinc-200">Duration</p>
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="group"
              aria-label="Goal duration"
            >
              {DURATION_PILL_OPTIONS.map((opt) => {
                const selected =
                  durationMode === 'preset' && durationPreset === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={formLocked}
                    onClick={() => selectPreset(opt.id)}
                    className={[
                      'rounded-full border-2 px-3 py-2.5 text-sm font-bold text-white transition-colors active:scale-[0.98] disabled:opacity-50',
                      selected
                        ? ''
                        : 'border-zinc-800 bg-app-surface hover:border-zinc-700',
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
                    {opt.label}
                  </button>
                )
              })}
              <button
                type="button"
                aria-pressed={durationMode === 'custom'}
                disabled={formLocked}
                onClick={selectCustomMode}
                className={[
                  'rounded-full border-2 px-3 py-2.5 text-sm font-bold text-white transition-colors active:scale-[0.98] disabled:opacity-50',
                  durationMode === 'custom'
                    ? ''
                    : 'border-zinc-800 bg-app-surface hover:border-zinc-700',
                ].join(' ')}
                style={
                  durationMode === 'custom'
                    ? {
                        borderColor: GOAL_PURPLE,
                        backgroundColor: 'rgba(83, 74, 183, 0.14)',
                      }
                    : undefined
                }
              >
                Custom
              </button>
            </div>

            {durationMode === 'custom' ? (
              <>
                <label
                  htmlFor="goal-target-date"
                  className="mt-6 block text-sm font-semibold text-zinc-200"
                >
                  Target date
                </label>
                <input
                  id="goal-target-date"
                  name="targetDate"
                  type="date"
                  min={customMinStr}
                  max={customMaxStr}
                  value={targetDate}
                  onChange={(ev) => setTargetDate(ev.target.value)}
                  disabled={formLocked}
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-app-surface px-4 py-3.5 text-base font-medium text-white outline-none focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 [color-scheme:dark] disabled:opacity-50"
                />
                <p className="mt-1.5 text-xs font-medium text-zinc-500">
                  Between 7 days and 3 years from today
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm font-semibold text-zinc-300">
                Target:{' '}
                <span className="text-white">
                  {formatTargetConfirmationLabel(targetDate)}
                </span>
              </p>
            )}

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
              disabled={formLocked}
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
            {infoBanner ? (
              <p
                className="mb-3 rounded-xl bg-amber-500/15 px-4 py-3 text-center text-sm font-semibold leading-snug text-amber-200 ring-1 ring-amber-500/35"
                role="status"
              >
                {infoBanner}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={formLocked}
              className="w-full rounded-xl bg-white py-4 text-base font-bold tracking-wide text-app-bg shadow-lg shadow-black/20 transition-opacity active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitButtonLabel(submitPhase)}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
