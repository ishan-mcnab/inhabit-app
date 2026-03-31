import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const GOAL_PURPLE = '#534AB7'

type QuestProgressionMode = 'weekly' | 'completion'

export function Profile() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<QuestProgressionMode>('weekly')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoading(false)
      setError(userError?.message ?? 'Not signed in')
      return
    }

    const { data, error: qErr } = await supabase
      .from('users')
      .select('quest_progression')
      .eq('id', user.id)
      .maybeSingle()

    setLoading(false)

    if (qErr) {
      setError(qErr.message)
      return
    }

    const raw = data?.quest_progression
    setMode(raw === 'completion' ? 'completion' : 'weekly')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function updateMode(next: QuestProgressionMode) {
    setError(null)
    const prev = mode
    setMode(next)
    setSaving(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setSaving(false)
      setMode(prev)
      setError(userError?.message ?? 'Not signed in')
      return
    }

    const { error: uErr } = await supabase
      .from('users')
      .update({ quest_progression: next })
      .eq('id', user.id)

    setSaving(false)

    if (uErr) {
      setMode(prev)
      setError(uErr.message)
      return
    }

    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 2000)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="shrink-0 border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Profile
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-6">
        <div className="mx-auto max-w-lg">
          {loading ? (
            <p className="text-sm font-medium text-zinc-500">Loading…</p>
          ) : error ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-app-bg"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Goal preferences
              </h2>
              <div
                className="mt-4 rounded-2xl border border-zinc-800/80 bg-app-surface p-4"
                style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)' }}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-base font-bold text-white">
                    Quest progression
                  </span>
                  <span className="text-sm font-medium text-zinc-500">
                    How your weekly quests unlock
                  </span>
                </div>

                <div
                  className="mt-4 flex rounded-xl border border-zinc-800 p-1"
                  role="group"
                  aria-label="Quest progression mode"
                >
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void updateMode('weekly')}
                    className={[
                      'flex-1 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors',
                      mode === 'weekly'
                        ? 'text-white'
                        : 'text-zinc-500 hover:text-zinc-300',
                    ].join(' ')}
                    style={
                      mode === 'weekly'
                        ? {
                            backgroundColor: 'rgba(83, 74, 183, 0.22)',
                            boxShadow: `inset 0 0 0 1px ${GOAL_PURPLE}55`,
                          }
                        : undefined
                    }
                  >
                    <span className="block">Weekly</span>
                    <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-zinc-500">
                      Quests unlock each week on schedule
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void updateMode('completion')}
                    className={[
                      'flex-1 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors',
                      mode === 'completion'
                        ? 'text-white'
                        : 'text-zinc-500 hover:text-zinc-300',
                    ].join(' ')}
                    style={
                      mode === 'completion'
                        ? {
                            backgroundColor: 'rgba(83, 74, 183, 0.22)',
                            boxShadow: `inset 0 0 0 1px ${GOAL_PURPLE}55`,
                          }
                        : undefined
                    }
                  >
                    <span className="block">On Completion</span>
                    <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-zinc-500">
                      Quests unlock when you finish the previous one
                    </span>
                  </button>
                </div>
              </div>

              {savedFlash ? (
                <p
                  className="mt-3 text-center text-sm font-semibold text-emerald-400"
                  role="status"
                >
                  Saved
                </p>
              ) : saving ? (
                <p className="mt-3 text-center text-xs font-medium text-zinc-500">
                  Saving…
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
