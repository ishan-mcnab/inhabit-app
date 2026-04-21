import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { streakTierTextStyle } from '../lib/streakTierStyle'
import {
  calculateRoutineStreakFromLogRows,
  formatLocalDateYmd,
  loadRoutineChecksFromStorage,
  type RoutineType,
} from '../lib/routineUtils'
import { HealthTrackersSection } from '../components/lifestyle/HealthTrackersSection'
import type { HealthSnapshot } from '../lib/healthTrackers'
import { supabase } from '../supabase'

const CARD_SURFACE = '#141418'
const CARD_BORDER = 'rgba(255,255,255,0.08)'
const MUTED = '#888780'
const MUTED_HEADING = '#888780'

type RoutineRow = {
  id: string
  name: string
  type: string
}

export function Lifestyle() {
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [morning, setMorning] = useState<{
    routine: RoutineRow
    itemCount: number
    doneToday: boolean
    checkedProgress: number
    streak: number
  } | null>(null)
  const [evening, setEvening] = useState<{
    routine: RoutineRow
    itemCount: number
    doneToday: boolean
    checkedProgress: number
    streak: number
  } | null>(null)

  const [healthUserId, setHealthUserId] = useState<string | null>(null)
  const [healthYmd, setHealthYmd] = useState(() => formatLocalDateYmd(new Date()))
  const [health, setHealth] = useState<HealthSnapshot>({
    sleep: null,
    water: null,
    mood: null,
  })

  const load = useCallback(async () => {
    const todayYmd = formatLocalDateYmd(new Date())
    setHealthYmd(todayYmd)
    setLoading(true)
    setError(null)
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      setHealthUserId(null)
      setLoading(false)
      setError(authErr?.message ?? 'Not signed in')
      return
    }

    const userId = user.id
    setHealthUserId(userId)

    const { data: existing } = await supabase
      .from('routines')
      .select('id,type')
      .eq('user_id', userId)
    const have = new Set((existing ?? []).map((r) => r.type))
    const inserts: { user_id: string; name: string; type: string }[] = []
    if (!have.has('morning')) {
      inserts.push({
        user_id: userId,
        name: 'Morning Routine',
        type: 'morning',
      })
    }
    if (!have.has('evening')) {
      inserts.push({
        user_id: userId,
        name: 'Evening Routine',
        type: 'evening',
      })
    }
    if (inserts.length > 0) {
      const { error: insErr } = await supabase.from('routines').insert(inserts)
      if (insErr) {
        setLoading(false)
        setError(insErr.message)
        return
      }
    }

    const { data: routines, error: rErr } = await supabase
      .from('routines')
      .select('id,name,type')
      .eq('user_id', userId)
      .in('type', ['morning', 'evening'])

    if (rErr || !routines) {
      setLoading(false)
      setError(rErr?.message ?? 'Failed to load routines')
      return
    }

    const routineRows: RoutineRow[] = routines

    async function buildSide(type: RoutineType) {
      const row = routineRows.find((x) => x.type === type) as RoutineRow | undefined
      if (!row) return null

      const [itemsRes, logToday, logsAll] = await Promise.all([
        supabase
          .from('routine_items')
          .select('id', { count: 'exact', head: true })
          .eq('routine_id', row.id)
          .eq('user_id', userId),
        supabase
          .from('routine_logs')
          .select('id')
          .eq('routine_id', row.id)
          .eq('user_id', userId)
          .eq('completed_at', todayYmd)
          .maybeSingle(),
        supabase
          .from('routine_logs')
          .select('completed_at')
          .eq('routine_id', row.id)
          .eq('user_id', userId)
          .order('completed_at', { ascending: false }),
      ])

      const n = itemsRes.count ?? 0
      if (itemsRes.error) {
        console.error('routine_items count:', itemsRes.error)
      }
      const doneToday = Boolean(logToday.data) && !logToday.error
      const stored = loadRoutineChecksFromStorage(row.id, todayYmd)
      const checkedProgress = doneToday
        ? n
        : Math.min(n, stored.length)

      const logRows = (logsAll.data ?? []) as { completed_at: unknown }[]
      if (logsAll.error) {
        console.error('routine_logs list:', logsAll.error)
      }
      const streak = calculateRoutineStreakFromLogRows(logRows, todayYmd)

      return {
        routine: row,
        itemCount: n,
        doneToday,
        checkedProgress,
        streak,
      }
    }

    const [m, e, sleepRes, waterRes, moodRes] = await Promise.all([
      buildSide('morning'),
      buildSide('evening'),
      supabase
        .from('sleep_logs')
        .select('bedtime,wake_time,rest_rating,notes')
        .eq('user_id', userId)
        .eq('log_date', todayYmd)
        .maybeSingle(),
      supabase
        .from('water_logs')
        .select('glasses_count,daily_target')
        .eq('user_id', userId)
        .eq('log_date', todayYmd)
        .maybeSingle(),
      supabase
        .from('mood_logs')
        .select('mood_rating,energy_rating,notes')
        .eq('user_id', userId)
        .eq('log_date', todayYmd)
        .maybeSingle(),
    ])
    setMorning(m)
    setEvening(e)

    const sleepRow = sleepRes.data as {
      bedtime: string | null
      wake_time: string | null
      rest_rating: number | null
      notes: string | null
    } | null
    const waterRow = waterRes.data as {
      glasses_count: number
      daily_target: number
    } | null
    const moodRow = moodRes.data as {
      mood_rating: number | null
      energy_rating: number | null
      notes: string | null
    } | null

    if (sleepRes.error) console.error('sleep_logs:', sleepRes.error)
    if (waterRes.error) console.error('water_logs:', waterRes.error)
    if (moodRes.error) console.error('mood_logs:', moodRes.error)

    setHealth({
      sleep: sleepRow
        ? {
            bedtime: sleepRow.bedtime,
            wake_time: sleepRow.wake_time,
            rest_rating:
              typeof sleepRow.rest_rating === 'number'
                ? sleepRow.rest_rating
                : null,
            notes: sleepRow.notes,
          }
        : null,
      water: waterRow
        ? {
            glasses_count:
              typeof waterRow.glasses_count === 'number'
                ? waterRow.glasses_count
                : 0,
            daily_target:
              typeof waterRow.daily_target === 'number'
                ? waterRow.daily_target
                : 8,
          }
        : null,
      mood: moodRow
        ? {
            mood_rating:
              typeof moodRow.mood_rating === 'number'
                ? moodRow.mood_rating
                : null,
            energy_rating:
              typeof moodRow.energy_rating === 'number'
                ? moodRow.energy_rating
                : null,
            notes: moodRow.notes,
          }
        : null,
    })

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (location.pathname !== '/lifestyle') return
    void load()
  }, [location.pathname, load])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (location.pathname !== '/lifestyle') return
      void load()
    }
    const onWindowFocus = () => {
      if (location.pathname !== '/lifestyle') return
      void load()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onWindowFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onWindowFocus)
    }
  }, [load, location.pathname])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <header className="shrink-0 border-b border-zinc-800/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto max-w-lg">
          <h1 className="text-[22px] font-semibold tracking-tight text-white">
            Lifestyle
          </h1>
          <p className="mt-1 text-[13px] font-medium" style={{ color: MUTED }}>
            Your daily routines and wellness
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-6">
        <div className="mx-auto max-w-lg space-y-10">
          {error ? (
            <p className="text-sm font-medium text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <section>
            <div className="-mx-1 flex items-center gap-3">
              <h2
                className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em]"
                style={{ color: MUTED_HEADING }}
              >
                Routines
              </h2>
              <div className="h-px min-w-[2rem] flex-1 bg-zinc-800/50" aria-hidden />
            </div>

            {loading ? (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="h-[120px] animate-pulse rounded-[12px] border border-zinc-800/60 bg-zinc-900/40" />
                <div className="h-[120px] animate-pulse rounded-[12px] border border-zinc-800/60 bg-zinc-900/40" />
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <RoutineCard
                  emoji="☀️"
                  label="Morning"
                  data={morning}
                  routineType="morning"
                />
                <RoutineCard
                  emoji="🌙"
                  label="Evening"
                  data={evening}
                  routineType="evening"
                />
              </div>
            )}
          </section>

          {healthUserId ? (
            <HealthTrackersSection
              userId={healthUserId}
              todayYmd={healthYmd}
              snapshot={health}
              loading={loading}
              onRefresh={() => void load()}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function RoutineCard({
  emoji,
  label,
  data,
  routineType,
}: {
  emoji: string
  label: string
  data: {
    routine: RoutineRow
    itemCount: number
    doneToday: boolean
    checkedProgress: number
    streak: number
  } | null
  routineType: RoutineType
}) {
  if (!data) return null

  const { itemCount, doneToday, checkedProgress, streak } = data
  const empty = itemCount === 0
  const subtitle = empty
    ? `Tap to set up your ${routineType} routine`
    : doneToday
      ? 'Completed today'
      : `${itemCount} item${itemCount === 1 ? '' : 's'}`
  const showProgressLine =
    !empty && !doneToday && checkedProgress > 0 && itemCount > 0

  return (
    <Link
      to={`/lifestyle/routine/${routineType}`}
      state={empty ? { startInEdit: true } : undefined}
      className="block min-h-[120px] rounded-[12px] border p-4 outline-none ring-app-accent/0 transition-transform focus-visible:ring-2 focus-visible:ring-app-accent/50 active:scale-[0.98]"
      style={{ backgroundColor: CARD_SURFACE, borderColor: CARD_BORDER }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
        {doneToday ? (
          <span className="shrink-0 rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/35">
            Done ✓
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm font-bold text-white">{label}</p>
      <p className="mt-1 text-xs font-medium" style={{ color: MUTED }}>
        {subtitle}
      </p>
      {showProgressLine ? (
        <p className="mt-2 text-xs font-medium" style={{ color: MUTED }}>
          {checkedProgress}/{itemCount} done
        </p>
      ) : null}
      {!empty && streak > 0 ? (
        <p
          className="mt-2 text-xs font-bold"
          style={streakTierTextStyle(streak)}
        >
          🔥 {streak} {streak === 1 ? 'day' : 'days'}
        </p>
      ) : null}
    </Link>
  )
}
