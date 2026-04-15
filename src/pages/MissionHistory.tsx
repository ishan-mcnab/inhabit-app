import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getMissionBoardAccent } from '../constants/missionBoardAccents'
import { supabase } from '../supabase'

const CARD_SURFACE = '#141418'
const CARD_BORDER = 'rgba(255,255,255,0.08)'
const MUTED = '#888780'

function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseYmdLocal(ymd: string): Date {
  const [y, mo, d] = ymd.split('-').map(Number)
  return new Date(y, mo - 1, d, 0, 0, 0, 0)
}

function addDaysLocal(ymd: string, delta: number): string {
  const d = parseYmdLocal(ymd)
  d.setDate(d.getDate() + delta)
  return formatYmd(d)
}

function headingLabel(ymd: string): string {
  return parseYmdLocal(ymd).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatCompletedTime(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  return t.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

type GoalEmbed = { title: string; category: string | null }

type MissionRow = {
  id: string
  title: string
  completed: boolean
  completed_at: string | null
  goal_id: string
  goals: GoalEmbed | GoalEmbed[] | null
}

function pickGoal(
  goals: GoalEmbed | GoalEmbed[] | null | undefined,
): GoalEmbed | null {
  if (!goals) return null
  if (Array.isArray(goals)) return goals[0] ?? null
  return goals
}

function HistoryMissionSkeleton() {
  return (
    <div className="mission-skeleton-shell flex min-h-[64px] items-stretch gap-3 rounded-2xl border border-zinc-800/80 p-4">
      <div className="w-[3px] shrink-0 self-stretch rounded-full bg-zinc-700" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-[80%] rounded bg-black/22" />
        <div className="h-3 w-1/2 rounded bg-black/22" />
      </div>
    </div>
  )
}

export function MissionHistory() {
  const bounds = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const min = new Date(today)
    min.setDate(min.getDate() - 30)
    return {
      minYmd: formatYmd(min),
      maxYmd: formatYmd(yesterday),
      defaultYmd: formatYmd(yesterday),
    }
  }, [])

  const [selectedYmd, setSelectedYmd] = useState(bounds.defaultYmd)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missions, setMissions] = useState<MissionRow[]>([])

  const canGoOlder = selectedYmd > bounds.minYmd
  const canGoNewer = selectedYmd < bounds.maxYmd

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      setLoading(false)
      setError(authErr?.message ?? 'Not signed in')
      setMissions([])
      return
    }

    const { data, error: qErr } = await supabase
      .from('daily_missions')
      .select(
        `
        id,
        title,
        completed,
        completed_at,
        goal_id,
        goals ( title, category )
      `,
      )
      .eq('user_id', user.id)
      .eq('due_date', selectedYmd)
      .order('created_at', { ascending: true })

    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      setMissions([])
      return
    }
    setMissions((data ?? []) as MissionRow[])
  }, [selectedYmd])

  useEffect(() => {
    void load()
  }, [load])

  const { done, total, rate } = useMemo(() => {
    const t = missions.length
    const d = missions.filter((m) => m.completed).length
    const r = t <= 0 ? 0 : Math.round((d / t) * 100)
    return { done: d, total: t, rate: r }
  }, [missions])

  const dayBadge = useMemo(() => {
    if (total === 0) return null
    if (rate >= 80)
      return { label: 'Great day', className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/35' }
    if (rate >= 50)
      return { label: 'Decent day', className: 'bg-amber-500/15 text-amber-200 ring-amber-500/35' }
    return { label: 'Missed day', className: 'bg-red-500/15 text-red-300 ring-red-500/35' }
  }, [total, rate])

  const fullClear = total > 0 && done === total

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="relative flex shrink-0 items-center justify-center border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to="/today"
          aria-label="Back to Today"
          className="absolute left-2 flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white"
        >
          <ChevronLeft size={22} aria-hidden strokeWidth={2} />
        </Link>
        <div className="min-w-0 px-10 text-center">
          <h1 className="text-lg font-bold tracking-tight text-white">
            Mission History
          </h1>
          <p className="mt-0.5 text-xs font-medium text-zinc-500">
            Your past missions
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-10 pt-5">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Previous day"
              disabled={!canGoOlder || loading}
              onClick={() => {
                if (!canGoOlder) return
                setSelectedYmd((y) => addDaysLocal(y, -1))
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft size={26} aria-hidden strokeWidth={2} />
            </button>
            <p className="min-w-0 flex-1 text-center text-base font-bold leading-snug text-white">
              {headingLabel(selectedYmd)}
            </p>
            <button
              type="button"
              aria-label="Next day"
              disabled={!canGoNewer || loading}
              onClick={() => {
                if (!canGoNewer) return
                setSelectedYmd((y) => addDaysLocal(y, 1))
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronRight size={26} aria-hidden strokeWidth={2} />
            </button>
          </div>

          {error ? (
            <p className="text-center text-sm font-medium text-red-400">{error}</p>
          ) : null}

          {!loading && !error && total === 0 ? (
            <p className="text-center text-sm font-medium text-zinc-500">
              No missions recorded for this day
            </p>
          ) : null}

          {!loading && !error && total > 0 ? (
            <div className="space-y-2">
              <p className="text-center text-sm font-semibold text-zinc-300">
                {done} of {total} missions completed
              </p>
              {dayBadge ? (
                <div className="flex justify-center">
                  <span
                    className={[
                      'rounded-full px-3 py-1 text-xs font-bold ring-1',
                      dayBadge.className,
                    ].join(' ')}
                  >
                    {dayBadge.label}
                  </span>
                </div>
              ) : null}
              {fullClear ? (
                <div
                  className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 text-center text-sm font-bold text-emerald-300 ring-1 ring-emerald-500/25"
                  role="status"
                >
                  Full clear! 🎉
                </div>
              ) : null}
            </div>
          ) : null}

          <ul className="mt-2 flex flex-col gap-3">
            {loading && !error
              ? [0, 1, 2].map((i) => <HistoryMissionSkeleton key={i} />)
              : missions.map((m) => {
                  const g = pickGoal(m.goals)
                  const accent = getMissionBoardAccent(g?.category ?? null)
                  const goalTitle = g?.title ?? 'Goal'
                  return (
                    <li
                      key={m.id}
                      className="flex min-h-[64px] gap-3 rounded-2xl border p-4"
                      style={{
                        backgroundColor: CARD_SURFACE,
                        borderColor: CARD_BORDER,
                      }}
                    >
                      <div
                        className="w-[3px] shrink-0 self-stretch rounded-full"
                        style={{ backgroundColor: accent }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={[
                            'text-sm font-semibold leading-snug text-white',
                            m.completed ? 'line-through opacity-70' : '',
                          ].join(' ')}
                        >
                          {m.title}
                        </p>
                        <p
                          className="mt-1 text-xs font-medium"
                          style={{ color: MUTED }}
                        >
                          {goalTitle}
                        </p>
                        {m.completed ? (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/25 text-emerald-400 ring-1 ring-emerald-500/40">
                              <Check size={14} strokeWidth={3} aria-hidden />
                            </span>
                            <p className="text-[11px] font-medium text-zinc-500">
                              Completed at {formatCompletedTime(m.completed_at)}
                            </p>
                          </div>
                        ) : (
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className="flex h-6 w-6 shrink-0 rounded-full border-2 border-red-500/45 bg-red-500/5"
                              aria-hidden
                            />
                            <p className="text-[11px] font-medium text-red-400/90">
                              Not completed
                            </p>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
          </ul>
        </div>
      </div>
    </div>
  )
}
