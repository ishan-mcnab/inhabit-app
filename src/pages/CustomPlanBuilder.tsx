import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Plus } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { calculateTotalWeeks } from '../lib/goalProgress'
import { appCache, goalsCacheKey, missionsCacheKey } from '../lib/cache'
import { supabase } from '../supabase'

const APP_ACCENT = '#F5A623'

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

export function CustomPlanBuilder() {
  const { goalId } = useParams<{ goalId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const editMode = searchParams.get('edit') === '1'

  type MissionTimeOfDay = 'morning' | 'afternoon' | 'evening' | null

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [goalTitle, setGoalTitle] = useState('')
  const [targetDateStr, setTargetDateStr] = useState<string | null>(null)
  const [totalWeeks, setTotalWeeks] = useState(1)

  const [questTitles, setQuestTitles] = useState<string[]>([])
  const [dailyTitles, setDailyTitles] = useState<string[]>(() =>
    Array(7).fill(''),
  )
  const [dailyTimes, setDailyTimes] = useState<MissionTimeOfDay[]>(() =>
    Array(7).fill(null),
  )

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const numQuestSlots = questTitles.length

  const canAddOneQuest = numQuestSlots < totalWeeks
  const canAddBatch =
    numQuestSlots >= 4 && numQuestSlots < totalWeeks

  const batchAddCount = useMemo(
    () => Math.min(4, totalWeeks - numQuestSlots),
    [totalWeeks, numQuestSlots],
  )

  const load = useCallback(async () => {
    if (!goalId) {
      setLoading(false)
      setLoadError('Missing goal')
      return
    }

    setLoading(true)
    setLoadError(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoading(false)
      setLoadError(userError?.message ?? 'Not signed in')
      return
    }

    const [goalRes, questsRes, missionsRes] = await Promise.all([
      supabase
        .from('goals')
        .select('id,title,target_date,user_id,is_custom_plan')
        .eq('id', goalId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('weekly_quests')
        .select('title,week_number')
        .eq('goal_id', goalId)
        .eq('user_id', user.id)
        .order('week_number', { ascending: true }),
      supabase
        .from('daily_missions')
        .select('title,due_date,time_of_day')
        .eq('goal_id', goalId)
        .eq('user_id', user.id)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(14),
    ])

    setLoading(false)

    if (goalRes.error || !goalRes.data) {
      setLoadError(goalRes.error?.message ?? 'Goal not found')
      return
    }

    const g = goalRes.data as {
      title: string
      target_date: string | null
      is_custom_plan?: boolean
    }

    if (!g.target_date) {
      setLoadError('Goal needs a target date to build a plan.')
      return
    }

    setGoalTitle(g.title)
    setTargetDateStr(g.target_date)
    const tw = calculateTotalWeeks(g.target_date)
    setTotalWeeks(tw)

    const hasPrefill =
      editMode ||
      (questsRes.data?.length ?? 0) > 0 ||
      (missionsRes.data?.length ?? 0) > 0

    if (hasPrefill && questsRes.data && questsRes.data.length > 0) {
      let maxWeek = 0
      for (const r of questsRes.data) {
        const w =
          typeof r.week_number === 'number' && !Number.isNaN(r.week_number)
            ? r.week_number
            : 0
        maxWeek = Math.max(maxWeek, w)
      }
      const slots = Math.min(
        Math.max(maxWeek, Math.min(4, tw)),
        tw,
      )
      const arr = Array(slots).fill('')
      for (const r of questsRes.data) {
        const w =
          typeof r.week_number === 'number' && !Number.isNaN(r.week_number)
            ? r.week_number
            : 0
        const title = typeof r.title === 'string' ? r.title : ''
        if (w >= 1 && w <= arr.length) arr[w - 1] = title
      }
      setQuestTitles(arr)
    } else {
      setQuestTitles(Array(Math.min(4, tw)).fill(''))
    }

    if (hasPrefill && missionsRes.data && missionsRes.data.length > 0) {
      const rows = missionsRes.data.slice(0, 14) as {
        title?: unknown
        time_of_day?: unknown
      }[]
      const slots = Math.max(7, Math.min(14, rows.length))
      const nextDaily = Array(slots).fill('')
      const nextTimes = Array(slots).fill(null) as MissionTimeOfDay[]
      for (let i = 0; i < slots; i++) {
        const t = rows[i]?.title
        nextDaily[i] = typeof t === 'string' ? t : ''
        const tod = rows[i]?.time_of_day
        nextTimes[i] =
          tod === 'morning' || tod === 'afternoon' || tod === 'evening'
            ? tod
            : null
      }
      setDailyTitles(nextDaily)
      setDailyTimes(nextTimes)
    } else {
      setDailyTitles(Array(7).fill(''))
      setDailyTimes(Array(7).fill(null))
    }

    if (questsRes.error) {
      console.error('CustomPlanBuilder: quests load', questsRes.error)
    }
    if (missionsRes.error) {
      console.error('CustomPlanBuilder: missions load', missionsRes.error)
    }
  }, [goalId, editMode])

  useEffect(() => {
    void load()
  }, [load])

  function setQuestAt(index: number, value: string) {
    setQuestTitles((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function addOneQuestSlot() {
    if (!canAddOneQuest) return
    setQuestTitles((prev) => [...prev, ''])
  }

  function addQuestBatch() {
    if (!canAddBatch || batchAddCount <= 0) return
    setQuestTitles((prev) => [
      ...prev,
      ...Array(batchAddCount).fill(''),
    ])
  }

  function setDailyAt(index: number, value: string) {
    setDailyTitles((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function toggleDailyTimeAt(
    index: number,
    next: Exclude<MissionTimeOfDay, null>,
  ) {
    setDailyTimes((prev) => {
      const arr = [...prev]
      arr[index] = arr[index] === next ? null : next
      return arr
    })
  }

  function addAnotherMissionField() {
    setDailyTitles((prev) => (prev.length >= 14 ? prev : [...prev, '']))
    setDailyTimes((prev) => (prev.length >= 14 ? prev : [...prev, null]))
  }

  async function handleSave() {
    setSaveError(null)
    if (!goalId) return

    const filledQuests = questTitles
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    const filledFirstSevenDaily = dailyTitles
      .slice(0, 7)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    if (filledQuests.length < 1) {
      setSaveError('Add at least one weekly milestone.')
      return
    }
    if (filledFirstSevenDaily.length < 3) {
      setSaveError('Add at least three daily actions.')
      return
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setSaveError(userError?.message ?? 'Not signed in')
      return
    }

    setSaving(true)

    const { error: delQ } = await supabase
      .from('weekly_quests')
      .delete()
      .eq('goal_id', goalId)
      .eq('user_id', user.id)

    if (delQ) {
      setSaving(false)
      setSaveError(delQ.message)
      return
    }

    const { error: delM } = await supabase
      .from('daily_missions')
      .delete()
      .eq('goal_id', goalId)
      .eq('user_id', user.id)

    if (delM) {
      setSaving(false)
      setSaveError(delM.message)
      return
    }

    const questRows: {
      goal_id: string
      user_id: string
      title: string
      week_number: number
      completed: boolean
      xp_reward: number
    }[] = []
    questTitles.forEach((raw, idx) => {
      const title = raw.trim()
      if (!title) return
      questRows.push({
        goal_id: goalId,
        user_id: user.id,
        title,
        week_number: idx + 1,
        completed: false,
        xp_reward: 150,
      })
    })

    if (questRows.length > 0) {
      const { error: insQ } = await supabase
        .from('weekly_quests')
        .insert(questRows)
      if (insQ) {
        setSaving(false)
        setSaveError(insQ.message)
        return
      }
    }

    const base = new Date()
    base.setHours(0, 0, 0, 0)

    const missionRows: {
      goal_id: string
      user_id: string
      title: string
      completed: boolean
      xp_reward: number
      due_date: string
      time_of_day?: string | null
    }[] = []

    dailyTitles.forEach((raw, i) => {
      const title = raw.trim()
      if (!title) return
      const tag = dailyTimes[i] ?? null
      missionRows.push({
        goal_id: goalId,
        user_id: user.id,
        title,
        completed: false,
        xp_reward: 25,
        due_date: formatLocalDate(addDays(base, i)),
        time_of_day: tag,
      })
    })

    if (missionRows.length > 0) {
      const { error: insM } = await supabase
        .from('daily_missions')
        .insert(missionRows)
      if (insM) {
        setSaving(false)
        setSaveError(insM.message)
        return
      }
    }

    appCache.invalidate(goalsCacheKey(user.id))
    appCache.invalidate(missionsCacheKey(user.id, formatLocalDate(new Date())))

    setSaving(false)
    void navigate('/goals', {
      replace: true,
      state: { toast: 'Your plan is saved! Time to execute.' },
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-app-bg px-4">
        <p className="text-sm font-medium text-zinc-500">Loading…</p>
      </div>
    )
  }

  if (loadError || !goalId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
        <header className="flex shrink-0 items-center border-b border-zinc-800/60 px-2 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link
            to="/goals"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white"
            aria-label="Back to goals"
          >
            <ChevronLeft size={20} aria-hidden strokeWidth={2} />
          </Link>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <p className="text-center text-sm font-medium text-red-400">
            {loadError ?? 'Something went wrong'}
          </p>
          <Link
            to="/goals"
            className="mt-4 text-sm font-semibold text-app-accent underline-offset-2 hover:underline"
          >
            Back to goals
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="flex shrink-0 flex-col gap-1 border-b border-zinc-800/60 px-2 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/goals"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white"
            aria-label="Back to goals"
          >
            <ChevronLeft size={20} aria-hidden strokeWidth={2} />
          </Link>
          <h1 className="min-w-0 flex-1 text-center text-base font-bold tracking-tight text-white">
            Build Your Plan
          </h1>
          <span className="w-10 shrink-0" aria-hidden />
        </div>
        <p
          className="px-4 pb-1 text-center text-xs font-medium text-zinc-500"
          title={goalTitle}
        >
          {goalTitle}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-32 pt-6">
        <div className="mx-auto max-w-lg">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
            Weekly Milestones
          </p>
          <p className="mt-1 text-xs font-medium text-zinc-500">
            What will you achieve each week? Add up to {totalWeeks}{' '}
            milestones.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {questTitles.map((val, idx) => (
              <label
                key={`q-${idx}`}
                className="block text-xs font-semibold text-zinc-400"
              >
                Week {idx + 1}:{' '}
                <input
                  type="text"
                  value={val}
                  onChange={(e) => setQuestAt(idx, e.target.value)}
                  placeholder="e.g. Complete 3 workout sessions"
                  disabled={saving}
                  className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-app-surface px-3 py-3 text-sm font-medium text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 disabled:opacity-50"
                />
              </label>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {canAddBatch ? (
              <button
                type="button"
                disabled={saving || batchAddCount <= 0}
                onClick={addQuestBatch}
                className="w-full rounded-xl border border-zinc-700 bg-app-surface py-3 text-sm font-bold text-white transition-opacity active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add more milestones (+{batchAddCount})
              </button>
            ) : null}
            {canAddOneQuest ? (
              <button
                type="button"
                disabled={saving}
                onClick={addOneQuestSlot}
                className="w-full rounded-xl border border-zinc-700 bg-app-surface py-3 text-sm font-bold text-white transition-opacity active:opacity-90 disabled:opacity-50"
              >
                Add milestone
              </button>
            ) : null}
          </div>

          <p className="mt-10 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
            Daily Actions
          </p>
          <p className="mt-1 text-xs font-medium text-zinc-500">
            What will you do every day to reach this goal?
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {dailyTitles.map((val, idx) => (
              <div key={`d-${idx}`} className="block">
                <label className="block text-xs font-semibold text-zinc-400">
                  Mission {idx + 1}:{' '}
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => setDailyAt(idx, e.target.value)}
                    placeholder="e.g. Study for 30 minutes"
                    disabled={saving}
                    className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-app-surface px-3 py-3 text-sm font-medium text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 disabled:opacity-50"
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      { key: 'morning' as const, label: 'Morning 🌅' },
                      { key: 'afternoon' as const, label: 'Afternoon ☀️' },
                      { key: 'evening' as const, label: 'Evening 🌙' },
                    ] as const
                  ).map((opt) => {
                    const selected = dailyTimes[idx] === opt.key
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        disabled={saving}
                        onClick={() => toggleDailyTimeAt(idx, opt.key)}
                        className="rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
                        style={{
                          borderColor: selected
                            ? APP_ACCENT
                            : 'rgba(255,255,255,0.12)',
                          backgroundColor: selected
                            ? 'rgba(245,166,35,0.18)'
                            : 'transparent',
                          color: selected ? '#ffffff' : '#888780',
                        }}
                        aria-pressed={selected}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            {dailyTitles.length < 14 ? (
              <button
                type="button"
                disabled={saving}
                onClick={addAnotherMissionField}
                className="inline-flex items-center gap-2 text-[13px] font-semibold disabled:opacity-50"
                style={{ color: APP_ACCENT }}
              >
                <Plus size={14} aria-hidden strokeWidth={2.5} />
                + Add mission
              </button>
            ) : (
              <p className="text-[13px] font-medium" style={{ color: '#888780' }}>
                Maximum 14 missions reached
              </p>
            )}
          </div>

          {saveError ? (
            <p
              className="mt-6 text-sm font-medium text-red-400"
              role="alert"
            >
              {saveError}
            </p>
          ) : null}

          {targetDateStr ? (
            <p className="mt-6 text-[11px] font-medium text-zinc-600">
              Target date: {targetDateStr} · Plan length: {totalWeeks} weeks
            </p>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-800/60 bg-app-bg px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="btn-press w-full rounded-xl py-4 text-base font-bold tracking-wide text-white shadow-lg shadow-black/20 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: APP_ACCENT }}
          >
            {saving ? 'Saving…' : 'Save My Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}
