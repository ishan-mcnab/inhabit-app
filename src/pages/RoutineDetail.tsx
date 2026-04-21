import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { XPToast } from '../components/XPToast'
import { useXpToastQueue } from '../hooks/useXpToastQueue'
import { awardXP } from '../lib/xp'
import { appCache, profileCacheKey } from '../lib/cache'
import {
  clearRoutineChecksStorage,
  formatLocalDateYmd,
  loadRoutineChecksFromStorage,
  saveRoutineChecksToStorage,
  type RoutineType,
} from '../lib/routineUtils'
import { supabase } from '../supabase'

const GOAL_PURPLE = '#534AB7'
const CARD_BORDER = 'rgba(255,255,255,0.08)'

type ItemRow = {
  id: string
  title: string
  position: number
}

function isRoutineType(s: string | undefined): s is RoutineType {
  return s === 'morning' || s === 'evening'
}

export function RoutineDetail() {
  const { type: typeParam } = useParams<{ type: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const startInEditFromNav = Boolean(
    (location.state as { startInEdit?: boolean } | null)?.startInEdit,
  )

  const {
    toast: xpToast,
    enqueueXpToast,
    onXpToastHide,
  } = useXpToastQueue()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [routineId, setRoutineId] = useState<string | null>(null)
  const [items, setItems] = useState<ItemRow[]>([])
  const [completedToday, setCompletedToday] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [editMode, setEditMode] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [celebration, setCelebration] = useState<string | null>(null)
  const [greenFlashKey, setGreenFlashKey] = useState(0)

  const todayYmd = useMemo(() => formatLocalDateYmd(new Date()), [])
  const routineType = isRoutineType(typeParam) ? typeParam : null
  const titleLabel =
    routineType === 'morning' ? 'Morning Routine' : 'Evening Routine'

  const load = useCallback(async () => {
    if (!routineType) {
      setLoading(false)
      setError('Invalid routine')
      return
    }

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

    setUserId(user.id)

    const { data: routine, error: rErr } = await supabase
      .from('routines')
      .select('id')
      .eq('user_id', user.id)
      .eq('type', routineType)
      .maybeSingle()

    if (rErr || !routine?.id) {
      setLoading(false)
      setError(rErr?.message ?? 'Routine not found')
      return
    }

    const rid = routine.id as string
    setRoutineId(rid)

    const [itemsRes, logRes] = await Promise.all([
      supabase
        .from('routine_items')
        .select('id,title,position')
        .eq('routine_id', rid)
        .eq('user_id', user.id)
        .order('position', { ascending: true }),
      supabase
        .from('routine_logs')
        .select('id')
        .eq('routine_id', rid)
        .eq('user_id', user.id)
        .eq('completed_at', todayYmd)
        .maybeSingle(),
    ])

    if (itemsRes.error) {
      setLoading(false)
      setError(itemsRes.error.message)
      return
    }

    const list = ((itemsRes.data ?? []) as ItemRow[]).map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ''),
      position:
        typeof r.position === 'number' && !Number.isNaN(r.position)
          ? r.position
          : 0,
    }))
    setItems(list)

    const done = !logRes.error && !!logRes.data
    setCompletedToday(done)

    if (done) {
      setCheckedIds(new Set(list.map((i) => i.id)))
    } else {
      const stored = loadRoutineChecksFromStorage(rid, todayYmd)
      const valid = new Set(stored.filter((id) => list.some((i) => i.id === id)))
      setCheckedIds(valid)
    }

    setLoading(false)
  }, [routineType, todayYmd])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (loading || !routineId || items.length > 0) return
    if (startInEditFromNav) {
      setEditMode(true)
    }
  }, [loading, routineId, items.length, startInEditFromNav])

  useEffect(() => {
    if (!routineId || completedToday) return
    saveRoutineChecksToStorage(routineId, todayYmd, [...checkedIds])
  }, [routineId, completedToday, checkedIds, todayYmd])

  function toggleCheck(id: string) {
    if (completedToday || editMode) return
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allChecked =
    items.length > 0 && items.every((i) => checkedIds.has(i.id))

  async function handleCompleteRoutine() {
    if (!userId || !routineId || !allChecked || items.length === 0) return

    const { data: existing } = await supabase
      .from('routine_logs')
      .select('id')
      .eq('routine_id', routineId)
      .eq('user_id', userId)
      .eq('completed_at', todayYmd)
      .maybeSingle()

    if (existing?.id) {
      setCelebration('Already logged today — no extra XP.')
      window.setTimeout(() => setCelebration(null), 2500)
      return
    }

    setSaving(true)
    const n = items.length
    const { error: logErr } = await supabase.from('routine_logs').insert({
      routine_id: routineId,
      user_id: userId,
      completed_at: todayYmd,
      items_completed: n,
      items_total: n,
      xp_earned: 50,
    })

    if (logErr) {
      setSaving(false)
      setError(logErr.message)
      return
    }

    try {
      await awardXP(userId, 50, 'routine_complete')
    } catch (e) {
      console.error('awardXP routine:', e)
    }

    appCache.invalidate(profileCacheKey(userId))
    clearRoutineChecksStorage(routineId, todayYmd)
    setCompletedToday(true)
    setCheckedIds(new Set(items.map((i) => i.id)))
    setSaving(false)
    enqueueXpToast(50)
    setGreenFlashKey((k) => k + 1)
    setCelebration('Routine complete! +50 XP')
    window.setTimeout(() => {
      setCelebration(null)
      void navigate('/lifestyle')
    }, 1400)
  }

  async function addItem() {
    if (!userId || !routineId) return
    const t = newTitle.trim()
    if (!t) return
    setSaving(true)
    const pos =
      items.length === 0
        ? 0
        : Math.max(...items.map((i) => i.position)) + 1
    const { data: row, error: insErr } = await supabase
      .from('routine_items')
      .insert({
        routine_id: routineId,
        user_id: userId,
        title: t,
        position: pos,
      })
      .select('id,title,position')
      .single()

    setSaving(false)
    if (insErr || !row) {
      setError(insErr?.message ?? 'Could not add item')
      return
    }
    setNewTitle('')
    setItems((prev) => [
      ...prev,
      {
        id: String((row as { id: string }).id),
        title: String((row as { title: string }).title),
        position:
          typeof (row as { position: number }).position === 'number'
            ? (row as { position: number }).position
            : pos,
      },
    ])
  }

  async function deleteItem(id: string) {
    if (!userId || !routineId) return
    setSaving(true)
    const { error: delErr } = await supabase
      .from('routine_items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (delErr) {
      setSaving(false)
      setError(delErr.message)
      return
    }

    const next = items
      .filter((i) => i.id !== id)
      .map((it, idx) => ({ ...it, position: idx }))
    await Promise.all(
      next.map((it) =>
        supabase
          .from('routine_items')
          .update({ position: it.position })
          .eq('id', it.id)
          .eq('user_id', userId),
      ),
    )
    setItems(next)
    setCheckedIds((prev) => {
      const s = new Set(prev)
      s.delete(id)
      return s
    })
    setSaving(false)
  }

  async function moveItem(index: number, dir: -1 | 1) {
    if (!userId) return
    const j = index + dir
    if (j < 0 || j >= items.length) return
    const copy = [...items]
    const [removed] = copy.splice(index, 1)
    copy.splice(j, 0, removed)
    const withPos = copy.map((it, idx) => ({ ...it, position: idx }))
    setSaving(true)
    const results = await Promise.all(
      withPos.map((it) =>
        supabase
          .from('routine_items')
          .update({ position: it.position })
          .eq('id', it.id)
          .eq('user_id', userId),
      ),
    )
    const failed = results.find((r) => r.error)
    setSaving(false)
    if (failed?.error) {
      setError(failed.error.message)
      void load()
      return
    }
    setItems(withPos)
  }

  if (!routineType) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-app-bg px-4">
        <p className="text-sm text-red-400">Invalid routine</p>
        <Link to="/lifestyle" className="mt-4 text-app-accent">
          Back
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      {xpToast ? (
        <XPToast
          key={xpToast.key}
          variant="xp"
          amount={xpToast.payload.kind === 'xp' ? xpToast.payload.amount : 0}
          visible
          onHide={onXpToastHide}
        />
      ) : null}
      {greenFlashKey > 0 ? (
        <div
          key={greenFlashKey}
          className="quest-completion-overlay-animate pointer-events-none fixed inset-0 z-[100] bg-emerald-500"
          aria-hidden
        />
      ) : null}

      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/60 px-2 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to="/lifestyle"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white"
          aria-label="Back to Lifestyle"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </Link>
        <h1 className="min-w-0 flex-1 text-center text-base font-bold text-white">
          {titleLabel}
        </h1>
        <button
          type="button"
          onClick={() => setEditMode((e) => !e)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white"
          aria-label={editMode ? 'Done editing' : 'Edit routine'}
        >
          {editMode ? (
            <span className="text-xs font-bold text-emerald-400">Done</span>
          ) : (
            <Pencil size={18} strokeWidth={2} />
          )}
        </button>
      </header>

      {completedToday ? (
        <div className="mx-4 mt-3 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-4 py-3 text-center text-sm font-bold text-emerald-300">
          Completed today ✓
        </div>
      ) : null}

      {celebration ? (
        <div className="mx-4 mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-3 text-center text-sm font-bold text-emerald-200">
          {celebration}
        </div>
      ) : null}

      {error ? (
        <p className="mx-4 mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-36 pt-4">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <ul className="mx-auto max-w-lg space-y-2">
            {items.map((it, index) => (
              <li
                key={it.id}
                className="flex items-stretch gap-2 rounded-xl border px-3 py-3"
                style={{ borderColor: CARD_BORDER }}
              >
                {editMode ? (
                  <>
                    <div className="flex shrink-0 flex-col justify-center gap-0.5">
                      <button
                        type="button"
                        disabled={saving || index === 0}
                        onClick={() => void moveItem(index, -1)}
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ChevronUp size={18} />
                      </button>
                      <button
                        type="button"
                        disabled={saving || index === items.length - 1}
                        onClick={() => void moveItem(index, 1)}
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ChevronDown size={18} />
                      </button>
                    </div>
                    <span className="min-w-0 flex-1 self-center text-sm font-medium text-white">
                      {it.title}
                    </span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void deleteItem(it.id)}
                      className="shrink-0 self-center rounded-lg p-2 text-red-400 hover:bg-red-500/10"
                      aria-label="Delete item"
                    >
                      <Trash2 size={18} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={completedToday}
                    onClick={() => toggleCheck(it.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span
                      className={[
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2',
                        checkedIds.has(it.id)
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                          : 'border-zinc-600 bg-transparent',
                      ].join(' ')}
                    >
                      {checkedIds.has(it.id) ? (
                        <Check size={14} strokeWidth={3} />
                      ) : null}
                    </span>
                    <span
                      className={[
                        'text-sm font-medium',
                        checkedIds.has(it.id)
                          ? 'text-zinc-500 line-through opacity-70'
                          : 'text-white',
                      ].join(' ')}
                    >
                      {it.title}
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {editMode ? (
          <div className="mx-auto mt-6 flex max-w-lg gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New item…"
              className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-app-surface px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addItem()
              }}
            />
            <button
              type="button"
              disabled={saving || !newTitle.trim()}
              onClick={() => void addItem()}
              className="shrink-0 rounded-xl bg-zinc-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        ) : null}
      </div>

      {!editMode && items.length > 0 ? (
        <div className="shrink-0 border-t border-zinc-800/60 bg-app-bg px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="mx-auto mb-3 max-w-lg text-center text-sm text-zinc-400">
            {items.filter((i) => checkedIds.has(i.id)).length} of {items.length}{' '}
            items complete
          </p>
          {completedToday ? (
            <button
              type="button"
              disabled
              className="mx-auto flex w-full max-w-lg justify-center rounded-xl bg-zinc-800 py-4 text-sm font-bold text-zinc-500"
            >
              Already done today
            </button>
          ) : (
            <button
              type="button"
              disabled={!allChecked || saving}
              onClick={() => void handleCompleteRoutine()}
              className="mx-auto flex w-full max-w-lg justify-center rounded-xl py-4 text-base font-bold text-white shadow-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: GOAL_PURPLE }}
            >
              Complete Routine
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
