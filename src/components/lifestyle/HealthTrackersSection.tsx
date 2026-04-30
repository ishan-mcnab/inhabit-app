import { useCallback, useEffect, useState } from 'react'
import { XPToast } from '../XPToast'
import { useXpToastQueue } from '../../hooks/useXpToastQueue'
import { appCache, profileCacheKey } from '../../lib/cache'
import type {
  HealthSnapshot,
  OptimisticMoodLog,
  OptimisticSleepLog,
} from '../../lib/healthTrackers'
import { hasXpReasonToday } from '../../lib/healthTrackers'
import { awardXP } from '../../lib/xp'
import { supabase } from '../../supabase'

const CARD_SURFACE = '#111827'
const CARD_BORDER = '#1C2840'
const MUTED = '#888780'
const MUTED_HEADING = '#888780'
const WATER_BLUE = '#185FA5'
const BAR_TRACK = '#2A2A2E'
const ACCENT = '#F5A623'
const ACCENT_TINT_15 = 'rgba(245,166,35,0.15)'
const ACCENT_TINT_20 = 'rgba(245,166,35,0.2)'
const RED = '#E24B4A'
const AMBER = '#BA7517'
const GREEN = '#1D9E75'

/** Android WebView often omits safe-area; fixed insets keep Save above the nav bar. */
const SHEET_MAX_HEIGHT = 'calc(100dvh - 120px)'
const SHEET_SCROLL_MAX_HEIGHT = 'calc(100dvh - 120px - 1.5rem)'
const SHEET_SCROLL_PADDING_BOTTOM = '80px'

const MOOD_PICK = ['😔', '😐', '🙂', '😊', '😄'] as const
const ENERGY_PICK = ['😴', '😪', '😐', '⚡', '🚀'] as const

const CARD_BASE =
  'card-interactive w-full rounded-[12px] border p-4 text-left shadow-sm transition-colors hover:bg-white/[0.04]'

function restTierColor(r: number): string {
  if (r <= 2) return RED
  if (r === 3) return AMBER
  return GREEN
}

function RestRatingDots({ rating }: { rating: number }) {
  const fill = restTierColor(rating)
  return (
    <span className="mt-2 flex gap-1 text-[12px] leading-none" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{ color: i <= rating ? fill : 'rgba(255,255,255,0.14)' }}
        >
          ●
        </span>
      ))}
    </span>
  )
}

function SleepLogModal({
  open,
  onClose,
  userId,
  todayYmd,
  initial,
  onSaved,
  enqueueXpToast,
}: {
  open: boolean
  onClose: () => void
  userId: string
  todayYmd: string
  initial: HealthSnapshot['sleep']
  onSaved: (row: OptimisticSleepLog) => void
  enqueueXpToast: (n: number) => void
}) {
  const [bedtime, setBedtime] = useState('')
  const [wakeTime, setWakeTime] = useState('')
  const [restRating, setRestRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setBedtime(initial?.bedtime?.trim() ?? '')
    setWakeTime(initial?.wake_time?.trim() ?? '')
    setRestRating(
      typeof initial?.rest_rating === 'number' &&
        initial.rest_rating >= 1 &&
        initial.rest_rating <= 5
        ? initial.rest_rating
        : null,
    )
    setNotes(initial?.notes?.trim() ?? '')
    setErr(null)
  }, [open, initial])

  const save = async () => {
    const bt = bedtime.trim()
    const wt = wakeTime.trim()
    if (!bt || !wt || restRating == null) {
      setErr('Add bedtime, wake time, and how rested you feel.')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const { data: existing } = await supabase
        .from('sleep_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('log_date', todayYmd)
        .maybeSingle()
      const isFirstToday = !existing

      const { error: upErr } = await supabase.from('sleep_logs').upsert(
        {
          user_id: userId,
          log_date: todayYmd,
          bedtime: bt,
          wake_time: wt,
          rest_rating: restRating,
          notes: notes.trim() || null,
        },
        { onConflict: 'user_id,log_date' },
      )
      if (upErr) {
        setErr(upErr.message)
        setSaving(false)
        return
      }
      if (isFirstToday) {
        try {
          await awardXP(userId, 10, 'sleep_logged')
          enqueueXpToast(10)
          appCache.invalidate(profileCacheKey(userId))
        } catch (e) {
          console.error('sleep_logged XP:', e)
        }
      }
      onClose()
      onSaved({
        bedtime: bt,
        wake_time: wt,
        rest_rating: restRating,
        notes: notes.trim() || null,
      })
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const labels = ['Terrible', 'Poor', 'OK', 'Good', 'Great']

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/65 p-0 motion-reduce:transition-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sleep-modal-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="min-h-0 flex-1"
        onClick={onClose}
      />
      <div
        className="w-full overflow-hidden rounded-t-3xl border border-zinc-800 border-b-0 bg-app-bg shadow-2xl"
        style={{ maxHeight: SHEET_MAX_HEIGHT }}
      >
        <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-zinc-700" />
        <div
          className="overflow-y-auto px-4 pt-3"
          style={{
            maxHeight: SHEET_SCROLL_MAX_HEIGHT,
            paddingBottom: SHEET_SCROLL_PADDING_BOTTOM,
          }}
        >
          <h2
            id="sleep-modal-title"
            className="text-center text-lg font-bold text-white"
          >
            Log Your Sleep
          </h2>
          <p className="mt-1 text-center text-sm" style={{ color: MUTED }}>
            How did you sleep last night?
          </p>

          <label className="mt-5 block text-xs font-semibold text-zinc-400">
            Fell asleep around
            <input
              type="text"
              value={bedtime}
              onChange={(e) => setBedtime(e.target.value)}
              placeholder="11:30 PM"
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-app-surface px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30"
            />
          </label>
          <label className="mt-3 block text-xs font-semibold text-zinc-400">
            Woke up at
            <input
              type="text"
              value={wakeTime}
              onChange={(e) => setWakeTime(e.target.value)}
              placeholder="7:00 AM"
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-app-surface px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30"
            />
          </label>

          <p className="mt-4 text-xs font-semibold text-zinc-400">Rest quality</p>
          <div className="mt-2 flex justify-between gap-1">
            {([1, 2, 3, 4, 5] as const).map((n) => {
              const sel = restRating === n
              const fill = restTierColor(n)
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRestRating(n)}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-bold transition-colors"
                  style={{
                    borderColor: sel ? ACCENT : 'rgba(255,255,255,0.1)',
                    backgroundColor: sel ? ACCENT_TINT_15 : 'transparent',
                    color: sel ? '#fff' : MUTED,
                  }}
                >
                  <span
                    className="flex size-9 items-center justify-center rounded-full text-sm"
                    style={{
                      backgroundColor: sel ? fill : 'rgba(28,40,64,0.8)',
                    }}
                  >
                    {n}
                  </span>
                  <span className="px-0.5 text-[10px] font-medium leading-tight">
                    {labels[n - 1]}
                  </span>
                </button>
              )
            })}
          </div>

          <label className="mt-4 block text-xs font-semibold text-zinc-400">
            Anything that affected your sleep?
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-app-surface px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30"
            />
          </label>

          {err ? (
            <p className="mt-3 text-center text-sm font-medium text-red-400">
              {err}
            </p>
          ) : null}

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="mt-5 w-full rounded-xl py-3.5 text-sm font-bold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
          >
            {saving ? 'Saving…' : 'Save Sleep Log'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MoodLogModal({
  open,
  onClose,
  userId,
  todayYmd,
  initial,
  onSaved,
  enqueueXpToast,
}: {
  open: boolean
  onClose: () => void
  userId: string
  todayYmd: string
  initial: HealthSnapshot['mood']
  onSaved: (row: OptimisticMoodLog) => void
  enqueueXpToast: (n: number) => void
}) {
  const [mood, setMood] = useState<number | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMood(
      typeof initial?.mood_rating === 'number' &&
        initial.mood_rating >= 1 &&
        initial.mood_rating <= 5
        ? initial.mood_rating
        : null,
    )
    setEnergy(
      typeof initial?.energy_rating === 'number' &&
        initial.energy_rating >= 1 &&
        initial.energy_rating <= 5
        ? initial.energy_rating
        : null,
    )
    setNotes(initial?.notes?.trim() ?? '')
    setErr(null)
  }, [open, initial])

  const save = async () => {
    if (mood == null || energy == null) {
      setErr('Pick your mood and energy level.')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const { data: existing } = await supabase
        .from('mood_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('log_date', todayYmd)
        .maybeSingle()
      const isFirstToday = !existing

      const { error: upErr } = await supabase.from('mood_logs').upsert(
        {
          user_id: userId,
          log_date: todayYmd,
          mood_rating: mood,
          energy_rating: energy,
          notes: notes.trim() || null,
        },
        { onConflict: 'user_id,log_date' },
      )
      if (upErr) {
        setErr(upErr.message)
        setSaving(false)
        return
      }
      if (isFirstToday) {
        try {
          await awardXP(userId, 5, 'mood_logged')
          enqueueXpToast(5)
          appCache.invalidate(profileCacheKey(userId))
        } catch (e) {
          console.error('mood_logged XP:', e)
        }
      }
      onClose()
      onSaved({
        mood_rating: mood,
        energy_rating: energy,
        notes: notes.trim() || null,
      })
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/65 p-0 motion-reduce:transition-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mood-modal-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="min-h-0 flex-1"
        onClick={onClose}
      />
      <div
        className="w-full overflow-hidden rounded-t-3xl border border-zinc-800 border-b-0 bg-app-bg shadow-2xl"
        style={{ maxHeight: SHEET_MAX_HEIGHT }}
      >
        <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-zinc-700" />
        <div
          className="overflow-y-auto px-4 pt-3"
          style={{
            maxHeight: SHEET_SCROLL_MAX_HEIGHT,
            paddingBottom: SHEET_SCROLL_PADDING_BOTTOM,
          }}
        >
          <h2
            id="mood-modal-title"
            className="text-center text-lg font-bold text-white"
          >
            Check In
          </h2>
          <p className="mt-1 text-center text-sm" style={{ color: MUTED }}>
            How are you feeling right now?
          </p>

          <p className="mt-5 text-[13px] font-semibold text-white">Mood</p>
          <div className="mt-2 flex justify-between gap-1">
            {MOOD_PICK.map((emo, idx) => {
              const n = idx + 1
              const sel = mood === n
              return (
                <button
                  key={emo}
                  type="button"
                  onClick={() => setMood(n)}
                  className="flex flex-1 items-center justify-center rounded-xl border py-2 text-2xl transition-colors"
                  style={{
                    borderColor: sel ? ACCENT : 'rgba(255,255,255,0.1)',
                    backgroundColor: sel ? ACCENT_TINT_20 : 'transparent',
                  }}
                >
                  {emo}
                </button>
              )
            })}
          </div>

          <p className="mt-5 text-[13px] font-semibold text-white">Energy</p>
          <div className="mt-2 flex justify-between gap-1">
            {ENERGY_PICK.map((emo, idx) => {
              const n = idx + 1
              const sel = energy === n
              return (
                <button
                  key={emo}
                  type="button"
                  onClick={() => setEnergy(n)}
                  className="flex flex-1 items-center justify-center rounded-xl border py-2 text-2xl transition-colors"
                  style={{
                    borderColor: sel ? ACCENT : 'rgba(255,255,255,0.1)',
                    backgroundColor: sel ? ACCENT_TINT_20 : 'transparent',
                  }}
                >
                  {emo}
                </button>
              )
            })}
          </div>

          <label className="mt-4 block text-xs font-semibold text-zinc-400">
            Anything on your mind?
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-app-surface px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30"
            />
          </label>

          {err ? (
            <p className="mt-3 text-center text-sm font-medium text-red-400">
              {err}
            </p>
          ) : null}

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="mt-5 w-full rounded-xl py-3.5 text-sm font-bold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
          >
            {saving ? 'Saving…' : 'Save Check In'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function HealthTrackersSection({
  userId,
  todayYmd,
  snapshot,
  loading,
  onSleepSaved,
  onWaterSaved,
  onMoodSaved,
}: {
  userId: string
  todayYmd: string
  snapshot: HealthSnapshot
  loading: boolean
  onSleepSaved: (row: OptimisticSleepLog) => void
  onWaterSaved: (glassesCount: number) => void
  onMoodSaved: (row: OptimisticMoodLog) => void
}) {
  const {
    toast: xpToast,
    enqueueXpToast,
    onXpToastHide,
  } = useXpToastQueue()
  const [sleepOpen, setSleepOpen] = useState(false)
  const [moodOpen, setMoodOpen] = useState(false)
  const [waterBusy, setWaterBusy] = useState(false)

  const glasses = snapshot.water?.glasses_count ?? 0
  const target = snapshot.water?.daily_target ?? 8
  const goalReached = glasses >= target

  const setWaterCount = useCallback(
    async (next: number) => {
      const clamped = Math.max(0, Math.min(target, next))
      setWaterBusy(true)
      const prev = snapshot.water?.glasses_count ?? 0
      try {
        const { error } = await supabase.from('water_logs').upsert(
          {
            user_id: userId,
            log_date: todayYmd,
            glasses_count: clamped,
            daily_target: target,
          },
          { onConflict: 'user_id,log_date' },
        )
        if (error) {
          console.error('water_logs:', error)
          return
        }
        if (clamped >= target && prev < target) {
          const already = await hasXpReasonToday(userId, 'water_goal_reached')
          if (!already) {
            try {
              await awardXP(userId, 15, 'water_goal_reached')
              enqueueXpToast(15)
              appCache.invalidate(profileCacheKey(userId))
            } catch (e) {
              console.error('water_goal_reached XP:', e)
            }
          }
        }
        onWaterSaved(clamped)
      } finally {
        setWaterBusy(false)
      }
    },
    [userId, todayYmd, target, snapshot.water, onWaterSaved, enqueueXpToast],
  )

  const onGlassCircleClick = (index: number) => {
    if (waterBusy) return
    if (index < glasses) {
      void setWaterCount(index)
    } else {
      void setWaterCount(Math.min(target, glasses + 1))
    }
  }

  const sleepLogged =
    snapshot.sleep &&
    snapshot.sleep.rest_rating != null &&
    Boolean(snapshot.sleep.bedtime?.trim()) &&
    Boolean(snapshot.sleep.wake_time?.trim())

  const moodLogged =
    snapshot.mood &&
    snapshot.mood.mood_rating != null &&
    snapshot.mood.energy_rating != null

  const barPct = target > 0 ? Math.min(100, (glasses / target) * 100) : 0
  const barFill = goalReached ? GREEN : WATER_BLUE

  return (
    <>
      {xpToast ? (
        xpToast.payload.kind === 'xp' ? (
          <XPToast
            key={xpToast.key}
            variant="xp"
            amount={xpToast.payload.amount}
            visible
            onHide={onXpToastHide}
          />
        ) : null
      ) : null}

      <SleepLogModal
        open={sleepOpen}
        onClose={() => setSleepOpen(false)}
        userId={userId}
        todayYmd={todayYmd}
        initial={snapshot.sleep}
        onSaved={onSleepSaved}
        enqueueXpToast={enqueueXpToast}
      />
      <MoodLogModal
        open={moodOpen}
        onClose={() => setMoodOpen(false)}
        userId={userId}
        todayYmd={todayYmd}
        initial={snapshot.mood}
        onSaved={onMoodSaved}
        enqueueXpToast={enqueueXpToast}
      />

      <div className="mt-10 space-y-6">
        <div className="-mx-1 flex items-center gap-3">
          <h2
            className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em]"
            style={{ color: MUTED_HEADING }}
          >
            Health trackers
          </h2>
          <div className="h-px min-w-[2rem] flex-1 bg-zinc-800/50" aria-hidden />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((k) => (
              <div
                key={k}
                className="h-[108px] animate-pulse rounded-[12px] border border-zinc-800/60 bg-zinc-900/40"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              className={CARD_BASE}
              style={{ backgroundColor: CARD_SURFACE, borderColor: CARD_BORDER }}
              onClick={() => setSleepOpen(true)}
            >
              <div className="flex items-start gap-3">
                <span className="text-[20px] leading-none" aria-hidden>
                  🌙
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-white">Sleep</p>
                    {sleepLogged ? (
                      <span className="shrink-0 rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/35">
                        Logged ✓
                      </span>
                    ) : null}
                  </div>
                  {sleepLogged && snapshot.sleep?.rest_rating != null ? (
                    <>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {snapshot.sleep.bedtime} → {snapshot.sleep.wake_time}
                      </p>
                      <RestRatingDots rating={snapshot.sleep.rest_rating} />
                    </>
                  ) : (
                    <p
                      className="mt-2 text-xs font-medium"
                      style={{ color: MUTED }}
                    >
                      Log tonight&apos;s sleep
                    </p>
                  )}
                  <span
                    className="mt-3 inline-block rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {sleepLogged ? 'Edit Sleep Log' : 'Log Sleep'}
                  </span>
                </div>
              </div>
            </button>

            <div
              className={CARD_BASE}
              style={{ backgroundColor: CARD_SURFACE, borderColor: CARD_BORDER }}
            >
              <div className="flex items-start gap-3">
                <span className="text-[20px] leading-none" aria-hidden>
                  💧
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-white">Water</p>
                    <button
                      type="button"
                      disabled={waterBusy || goalReached}
                      onClick={() => void setWaterCount(glasses + 1)}
                      className="shrink-0 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-white/5 disabled:opacity-40"
                    >
                      +1 Glass
                    </button>
                  </div>
                  <div
                    className="mt-2 h-2 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: BAR_TRACK }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: barFill,
                      }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium" style={{ color: MUTED }}>
                      {glasses} / {target} glasses
                    </p>
                    {goalReached ? (
                      <p className="text-xs font-bold text-emerald-400">
                        Goal reached! 💧
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="mt-3 flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Glasses today"
                  >
                    {Array.from({ length: target }, (_, i) => {
                      const filled = i < glasses
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={waterBusy}
                          onClick={() => onGlassCircleClick(i)}
                          className="flex size-7 items-center justify-center rounded-full border transition-transform active:scale-95 disabled:opacity-50"
                          style={{
                            borderColor: filled ? WATER_BLUE : 'rgba(255,255,255,0.12)',
                            backgroundColor: filled ? WATER_BLUE : 'transparent',
                          }}
                          aria-label={
                            filled ? `Remove glass ${i + 1}` : `Add glass ${i + 1}`
                          }
                        >
                          <span
                            className="size-3 rounded-full"
                            style={{
                              backgroundColor: filled
                                ? 'rgba(255,255,255,0.95)'
                                : 'rgba(255,255,255,0.15)',
                            }}
                          />
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              className={CARD_BASE}
              style={{ backgroundColor: CARD_SURFACE, borderColor: CARD_BORDER }}
              onClick={() => setMoodOpen(true)}
            >
              <div className="flex items-start gap-3">
                <span className="text-[20px] leading-none" aria-hidden>
                  ⚡
                </span>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-bold text-white">Mood &amp; Energy</p>
                  {moodLogged &&
                  snapshot.mood?.mood_rating &&
                  snapshot.mood?.energy_rating ? (
                    <p className="mt-1 text-xs font-medium text-white">
                      Mood {MOOD_PICK[snapshot.mood.mood_rating - 1]} · Energy{' '}
                      {ENERGY_PICK[snapshot.mood.energy_rating - 1]}
                    </p>
                  ) : (
                    <p
                      className="mt-1 text-xs font-medium"
                      style={{ color: MUTED }}
                    >
                      How are you feeling today?
                    </p>
                  )}
                </div>
              </div>
            </button>
          </div>
        )}
      </div>
    </>
  )
}
