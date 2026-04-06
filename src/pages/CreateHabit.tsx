import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGoalCategoryDisplay } from '../constants/goalCategoryPills'
import { supabase } from '../supabase'

const PURPLE = '#534AB7'

const HABIT_CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: 'fitness_consistency', label: 'Fitness Consistency', emoji: '💪' },
  { id: 'health_habits', label: 'Health Habits', emoji: '🛌' },
  { id: 'skills_growth', label: 'Skills & Growth', emoji: '🧠' },
  { id: 'building_confidence', label: 'Building Confidence', emoji: '👊' },
  {
    id: 'mental_emotional_health',
    label: 'Mental & Emotional Health',
    emoji: '🧘',
  },
  { id: 'financial_goals', label: 'Financial Goals', emoji: '💰' },
]

type Frequency = 'daily' | 'weekdays'
type TimeOfDay = 'morning' | 'afternoon' | 'evening'

export function CreateHabit() {
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>('')
  const [frequency, setFrequency] = useState<Frequency>('daily')
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('morning')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayCategory = useMemo(() => {
    if (!category) return null
    return getGoalCategoryDisplay(category)
  }, [category])

  async function submit() {
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Habit name is required')
      return
    }
    if (!category) {
      setError('Category is required')
      return
    }

    setSaving(true)
    setError(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setSaving(false)
      setError(userError?.message ?? 'Not signed in')
      return
    }

    const { error: insErr } = await supabase.from('habits').insert({
      user_id: user.id,
      title: trimmed,
      category,
      frequency,
      time_of_day: timeOfDay,
      current_streak: 0,
      last_completed: null,
    })

    setSaving(false)

    if (insErr) {
      setError(insErr.message)
      return
    }

    nav('/today')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="shrink-0 border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            New habit
          </h1>
          {displayCategory ? (
            <span className="text-sm font-semibold text-zinc-500">
              {displayCategory.emoji} {displayCategory.label}
            </span>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-6">
        <div className="mx-auto max-w-lg space-y-8">
          {error ? (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
              {error}
            </p>
          ) : null}

          <section aria-labelledby="habit-name-heading">
            <h2
              id="habit-name-heading"
              className="text-sm font-bold uppercase tracking-wider text-zinc-500"
            >
              Habit name
            </h2>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's your habit?"
              disabled={saving}
              className="mt-3 w-full rounded-2xl border border-zinc-800/80 bg-app-surface px-4 py-4 text-base font-bold text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 disabled:opacity-50"
            />
          </section>

          <section aria-labelledby="habit-category-heading">
            <h2
              id="habit-category-heading"
              className="text-sm font-bold uppercase tracking-wider text-zinc-500"
            >
              Category
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {HABIT_CATEGORIES.map((c) => {
                const active = category === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={saving}
                    onClick={() => setCategory(c.id)}
                    className={[
                      'rounded-full px-3 py-2 text-sm font-bold transition-colors',
                      active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
                    ].join(' ')}
                    style={
                      active
                        ? {
                            backgroundColor: 'rgba(83, 74, 183, 0.22)',
                            boxShadow: `inset 0 0 0 1px ${PURPLE}55`,
                          }
                        : {
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                          }
                    }
                  >
                    <span aria-hidden className="mr-1">
                      {c.emoji}
                    </span>
                    {c.label}
                  </button>
                )
              })}
            </div>
          </section>

          <section aria-labelledby="habit-frequency-heading">
            <h2
              id="habit-frequency-heading"
              className="text-sm font-bold uppercase tracking-wider text-zinc-500"
            >
              Frequency
            </h2>
            <div className="mt-3 flex gap-2">
              {[
                { id: 'daily' as const, label: 'Every day' },
                { id: 'weekdays' as const, label: 'Weekdays only' },
              ].map((opt) => {
                const active = frequency === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={saving}
                    onClick={() => setFrequency(opt.id)}
                    className={[
                      'flex-1 rounded-xl px-3 py-3 text-sm font-bold transition-colors',
                      active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
                    ].join(' ')}
                    style={
                      active
                        ? {
                            backgroundColor: 'rgba(83, 74, 183, 0.22)',
                            boxShadow: `inset 0 0 0 1px ${PURPLE}55`,
                          }
                        : {
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                          }
                    }
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </section>

          <section aria-labelledby="habit-time-heading">
            <h2
              id="habit-time-heading"
              className="text-sm font-bold uppercase tracking-wider text-zinc-500"
            >
              Time of day
            </h2>
            <div className="mt-3 flex gap-2">
              {[
                { id: 'morning' as const, label: 'Morning' },
                { id: 'afternoon' as const, label: 'Afternoon' },
                { id: 'evening' as const, label: 'Evening' },
              ].map((opt) => {
                const active = timeOfDay === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={saving}
                    onClick={() => setTimeOfDay(opt.id)}
                    className={[
                      'flex-1 rounded-xl px-3 py-3 text-sm font-bold transition-colors',
                      active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
                    ].join(' ')}
                    style={
                      active
                        ? {
                            backgroundColor: 'rgba(83, 74, 183, 0.22)',
                            boxShadow: `inset 0 0 0 1px ${PURPLE}55`,
                          }
                        : {
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                          }
                    }
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </section>

          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="w-full rounded-2xl py-4 text-center text-sm font-bold text-white transition-opacity active:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: PURPLE }}
          >
            {saving ? 'Creating…' : 'Create Habit'}
          </button>
        </div>
      </div>
    </div>
  )
}

