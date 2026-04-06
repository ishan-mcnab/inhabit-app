import { useCallback, useEffect, useState } from 'react'
import { formatIsoWeekRangeLabel, getLocalISOWeekYear } from '../lib/isoWeek'
import { supabase } from '../supabase'

type ReflectionHistoryRow = {
  id: string
  week_number: number
  iso_week_year: number | null
  mission_completion_rate: number | null
  ai_insight: string | null
  win_answer: string | null
  miss_answer: string | null
  improve_answer: string | null
  created_at: string
}

const PREVIEW_LEN = 100

export function Progress() {
  const [rows, setRows] = useState<ReflectionHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

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
      return
    }

    const { data, error: qErr } = await supabase
      .from('reflections')
      .select(
        'id,week_number,iso_week_year,mission_completion_rate,ai_insight,win_answer,miss_answer,improve_answer,created_at',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4)

    setLoading(false)

    if (qErr) {
      setError(qErr.message)
      setRows([])
      return
    }

    setRows((data ?? []) as ReflectionHistoryRow[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function weekRangeLabel(r: ReflectionHistoryRow): string {
    const y =
      r.iso_week_year ??
      getLocalISOWeekYear(new Date(r.created_at))
    return formatIsoWeekRangeLabel(y, r.week_number)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="shrink-0 border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Progress
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Track how you&apos;re building over time
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-12 pt-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
          Reflection history
        </h2>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading…</p>
        ) : error ? (
          <p className="mt-4 text-sm text-red-400">{error}</p>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            No reflections yet — complete your first one on Sunday
          </p>
        ) : (
          <ul className="mt-4 flex max-w-lg flex-col gap-3">
            {rows.map((r) => {
              const insight = r.ai_insight?.trim() ?? ''
              const hasAnswers = !!(
                r.win_answer?.trim() ||
                r.miss_answer?.trim() ||
                r.improve_answer?.trim()
              )
              const insightPreview =
                insight.length <= PREVIEW_LEN
                  ? insight
                  : `${insight.slice(0, PREVIEW_LEN)}…`
              const isOpen = !!expanded[r.id]
              const rate = r.mission_completion_rate
              const showToggle =
                insight.length > PREVIEW_LEN || hasAnswers
              const insightShown =
                isOpen || insight.length <= PREVIEW_LEN
                  ? insight
                  : insightPreview
              return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-zinc-800/80 bg-app-surface p-4 ring-1 ring-zinc-800/40"
                >
                  <p className="text-sm font-bold text-white">
                    {weekRangeLabel(r)}
                  </p>
                  {rate != null ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      {rate}% mission completion that week
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-600">
                      Mission completion rate not recorded
                    </p>
                  )}
                  {insight ? (
                    <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                      {insightShown}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-600">
                      No coaching note for this week
                    </p>
                  )}
                  {showToggle ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [r.id]: !prev[r.id],
                        }))
                      }
                      className="mt-2 text-xs font-bold text-app-accent underline-offset-2 hover:underline"
                    >
                      {isOpen ? 'Show less' : 'Read more'}
                    </button>
                  ) : null}
                  {isOpen && hasAnswers ? (
                    <div className="mt-4 space-y-3 border-t border-zinc-800/80 pt-4 text-sm text-zinc-400">
                      <div>
                        <p className="text-[11px] font-bold uppercase text-zinc-500">
                          Win
                        </p>
                        <p className="mt-0.5">{r.win_answer ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase text-zinc-500">
                          Miss
                        </p>
                        <p className="mt-0.5">{r.miss_answer ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase text-zinc-500">
                          Change
                        </p>
                        <p className="mt-0.5">{r.improve_answer ?? '—'}</p>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
