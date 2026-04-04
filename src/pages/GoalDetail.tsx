import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { XPToast } from '../components/XPToast'
import { getGoalCategoryDisplay } from '../constants/goalCategoryPills'
import { getMissionBoardAccent } from '../constants/missionBoardAccents'
import { useXpToastQueue } from '../hooks/useXpToastQueue'
import { generateMissions } from '../lib/generateMissions'
import {
  calculateCurrentWeekFromGoalStart,
  calculateProgressPercent,
  calculateTotalWeeks,
  weeklyQuestBatchRanges,
} from '../lib/goalProgress'
import { generateOneWeeklyQuestTitle } from '../lib/openRouterSingle'
import { awardXP } from '../lib/xp'
import { supabase } from '../supabase'

const QUEST_PURPLE = '#534AB7'
const OVERLAY_BG = 'rgba(13,13,15,0.8)'

const DURATION_PRESET_DAYS: Record<'1m' | '3m' | '6m' | '1y', number> = {
  '1m': 30,
  '3m': 90,
  '6m': 182,
  '1y': 365,
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseIsoLocal(iso: string): Date {
  const parts = iso.split('-').map(Number)
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = parseIsoLocal(fromIso).getTime()
  const b = parseIsoLocal(toIso).getTime()
  return Math.round((b - a) / 86_400_000)
}

type GoalRow = {
  id: string
  title: string
  category: string | null
  target_date: string | null
  progress_percent: number
  status: string
  completed_at: string | null
  created_at: string
}

type WeeklyQuestRow = {
  id: string
  goal_id: string
  title: string
  week_number: number
  completed: boolean
}

function formatDueDate(isoDate: string | null): string {
  if (!isoDate) return '—'
  const parts = isoDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate
  const [y, m, d] = parts
  const local = new Date(y, m - 1, d)
  return local.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function clampPercent(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.min(100, Math.max(0, n))
}

type QuestProgressionMode = 'weekly' | 'completion'

function isQuestLockedForMode(
  q: WeeklyQuestRow,
  sortedQuests: WeeklyQuestRow[],
  mode: QuestProgressionMode,
  currentWeekFromStart: number,
): boolean {
  if (mode === 'weekly') {
    return q.week_number > currentWeekFromStart
  }
  if (q.week_number <= 1) return false
  const prev = sortedQuests.find((x) => x.week_number === q.week_number - 1)
  return !prev?.completed
}

function formatUnlocksLabel(goalCreatedAt: string, weekNumber: number): string {
  const base = new Date(goalCreatedAt)
  const unlock = new Date(base)
  unlock.setDate(unlock.getDate() + (weekNumber - 1) * 7)
  const part = unlock.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return `Unlocks ${part}`
}

function pickActiveQuest(
  quests: WeeklyQuestRow[],
  currentWeek: number,
  mode: QuestProgressionMode,
): WeeklyQuestRow | null {
  if (quests.length === 0) return null
  const sorted = [...quests].sort((a, b) => a.week_number - b.week_number)

  const locked = (q: WeeklyQuestRow) =>
    isQuestLockedForMode(q, sorted, mode, currentWeek)

  // Completion mode: hero quest is always the first incomplete, unlocked quest
  if (mode === 'completion') {
    const unlocked = sorted.filter((q) => !locked(q))
    if (unlocked.length === 0) return null
    const firstIncomplete = unlocked.find((q) => !q.completed)
    return firstIncomplete ?? unlocked[unlocked.length - 1]
  }

  // Weekly mode: prefer the quest for the current calendar week if it's
  // unlocked and not yet completed. Otherwise fall back to the next
  // incomplete, unlocked quest.
  const byCal = sorted.find((q) => q.week_number === currentWeek)
  if (byCal && !locked(byCal) && !byCal.completed) {
    return byCal
  }

  const unlocked = sorted.filter((q) => !locked(q))
  if (unlocked.length === 0) return null

  const firstIncomplete = unlocked.find((q) => !q.completed)
  if (firstIncomplete) return firstIncomplete

  // If everything unlocked is completed, surface the last one as a summary.
  return unlocked[unlocked.length - 1]
}

function DetailSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 px-4 pb-10 pt-2">
      <div className="mission-skeleton-shell h-8 w-[75%] max-w-md rounded-lg" />
      <div className="h-4 w-40 rounded-lg bg-[#1e1e22] mission-skeleton-shell" />
      <div className="h-4 w-56 rounded-lg bg-[#1e1e22] mission-skeleton-shell" />
      <div className="mt-2 h-3 w-full max-w-lg rounded-full bg-zinc-800" />
      <div className="mt-8">
        <div className="h-5 w-40 rounded bg-zinc-800" />
        <div className="mission-skeleton-shell mt-4 min-h-[100px] rounded-2xl" />
      </div>
      <div className="mt-4">
        <div className="h-5 w-28 rounded bg-zinc-800" />
        <div className="mt-3 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="mission-skeleton-shell h-14 rounded-xl"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 11V8a5 5 0 0110 0v3M6 11h12v10H6V11z"
      />
    </svg>
  )
}

export function GoalDetail() {
  const navigate = useNavigate()
  const { goalId } = useParams<{ goalId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [goal, setGoal] = useState<GoalRow | null>(null)
  const [quests, setQuests] = useState<WeeklyQuestRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [successFlashId, setSuccessFlashId] = useState<string | null>(null)
  const [generatingNextBatch, setGeneratingNextBatch] = useState(false)
  const [batchUnlockBanner, setBatchUnlockBanner] = useState<string | null>(
    null,
  )
  const [nextBatchError, setNextBatchError] = useState<string | null>(null)
  const [questProgression, setQuestProgression] =
    useState<QuestProgressionMode>('weekly')

  const [goalMenuOpen, setGoalMenuOpen] = useState(false)
  const [goalToast, setGoalToast] = useState<string | null>(null)

  const [editingGoalTitle, setEditingGoalTitle] = useState(false)
  const [goalTitleDraft, setGoalTitleDraft] = useState('')
  const [savingGoalTitle, setSavingGoalTitle] = useState(false)

  const [editingTargetDate, setEditingTargetDate] = useState(false)
  const [targetMode, setTargetMode] = useState<'preset' | 'custom'>('preset')
  const [targetPreset, setTargetPreset] = useState<'1m' | '3m' | '6m' | '1y'>(
    '3m',
  )
  const [targetDateDraft, setTargetDateDraft] = useState<string>('')
  const [savingTargetDate, setSavingTargetDate] = useState(false)

  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [regeneratingPlan, setRegeneratingPlan] = useState(false)
  const [deletingGoal, setDeletingGoal] = useState(false)

  const [questMenuOpenId, setQuestMenuOpenId] = useState<string | null>(null)
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null)
  const [questTitleDraft, setQuestTitleDraft] = useState('')
  const [savingQuestId, setSavingQuestId] = useState<string | null>(null)
  const [regeneratingQuestId, setRegeneratingQuestId] = useState<string | null>(
    null,
  )

  const batchGenInFlight = useRef(false)

  const { toast: xpToast, enqueueXpToast, onXpToastHide } = useXpToastQueue()

  const load = useCallback(async () => {
    if (!goalId) {
      setLoading(false)
      setError('Missing goal id')
      return
    }

    setLoading(true)
    setError(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoading(false)
      setError(userError?.message ?? 'Not signed in')
      setUserId(null)
      return
    }

    setUserId(user.id)

    const [goalRes, questsRes, userPrefsRes] = await Promise.all([
      supabase
        .from('goals')
        .select(
          'id,title,category,target_date,progress_percent,status,completed_at,created_at',
        )
        .eq('id', goalId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('weekly_quests')
        .select('id,goal_id,title,week_number,completed')
        .eq('goal_id', goalId)
        .eq('user_id', user.id)
        .order('week_number', { ascending: true }),
      supabase
        .from('users')
        .select('quest_progression')
        .eq('id', user.id)
        .maybeSingle(),
    ])

    setLoading(false)

    const qpRaw = userPrefsRes.data?.quest_progression
    setQuestProgression(qpRaw === 'completion' ? 'completion' : 'weekly')

    if (goalRes.error) {
      setGoal(null)
      setQuests([])
      setError(goalRes.error.message)
      return
    }
    if (!goalRes.data) {
      setGoal(null)
      setQuests([])
      setError('Goal not found')
      return
    }

    const raw = goalRes.data as Partial<GoalRow> & GoalRow
    setGoal({
      ...raw,
      status: raw.status ?? 'active',
      completed_at: raw.completed_at ?? null,
      created_at: raw.created_at ?? new Date().toISOString(),
    })

    if (questsRes.error) {
      setQuests([])
      setError(questsRes.error.message)
      return
    }

    setQuests((questsRes.data ?? []) as WeeklyQuestRow[])
    setError(null)
  }, [goalId])

  const generateNextBatch = useCallback(async () => {
    if (!goal || !userId || !goalId) return
    if (!goal.target_date || !goal.created_at) return
    if (batchGenInFlight.current) return

    batchGenInFlight.current = true
    setGeneratingNextBatch(true)
    setNextBatchError(null)

    try {
      const { data: fresh } = await supabase
        .from('weekly_quests')
        .select('week_number')
        .eq('goal_id', goalId)
        .eq('user_id', userId)
        .order('week_number', { ascending: false })
        .limit(1)

      const maxNow = fresh?.[0]?.week_number ?? 0
      const totalNow = calculateTotalWeeks(goal.target_date!)

      if (maxNow >= totalNow) {
        return
      }

      const batchStart = maxNow + 1
      const batchEnd = Math.min(maxNow + 4, totalNow)

      const { data: profile } = await supabase
        .from('users')
        .select('goal_context')
        .eq('id', userId)
        .maybeSingle()

      let userContext: Record<string, unknown> | undefined
      const cat = goal.category ?? 'health_habits'
      const rawCtx = profile?.goal_context
      if (
        rawCtx &&
        typeof rawCtx === 'object' &&
        !Array.isArray(rawCtx) &&
        cat in (rawCtx as object)
      ) {
        const slice = (rawCtx as Record<string, unknown>)[cat]
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

      const missions = await generateMissions(
        goal.title,
        cat,
        goal.target_date!,
        userContext,
        batchStart,
        batchEnd,
        totalNow,
      )

      const rows = missions.weekly_quests.map((title, i) => ({
        goal_id: goalId,
        user_id: userId,
        title,
        week_number: batchStart + i,
        completed: false,
        xp_reward: 150,
      }))

      const { error: insErr } = await supabase
        .from('weekly_quests')
        .insert(rows)

      if (insErr) {
        setNextBatchError(insErr.message)
        return
      }

      setBatchUnlockBanner(
        `New quests unlocked for weeks ${batchStart}–${batchEnd}!`,
      )
      window.setTimeout(() => setBatchUnlockBanner(null), 6500)
      await load()
    } catch (e) {
      setNextBatchError(
        e instanceof Error ? e.message : 'Could not load next quests',
      )
    } finally {
      batchGenInFlight.current = false
      setGeneratingNextBatch(false)
    }
  }, [goal, userId, goalId, load])

  useEffect(() => {
    if (!goalToast) return
    const t = window.setTimeout(() => setGoalToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [goalToast])

  useEffect(() => {
    if (!goal) return
    setGoalTitleDraft(goal.title ?? '')
  }, [goal])

  function openEditGoalTitle() {
    if (!goal) return
    setGoalMenuOpen(false)
    setEditingGoalTitle(true)
    setGoalTitleDraft(goal.title ?? '')
  }

  function closeEditGoalTitle() {
    setEditingGoalTitle(false)
    setGoalTitleDraft(goal?.title ?? '')
  }

  async function saveGoalTitle() {
    if (!goal || !userId || !goalId) return
    const next = goalTitleDraft.trim()
    if (!next) {
      setError('Goal title cannot be empty')
      return
    }
    setSavingGoalTitle(true)
    setError(null)
    const { error: uErr } = await supabase
      .from('goals')
      .update({ title: next })
      .eq('id', goalId)
      .eq('user_id', userId)
    setSavingGoalTitle(false)
    if (uErr) {
      setError(uErr.message)
      return
    }
    setGoal((g) => (g ? { ...g, title: next } : g))
    setEditingGoalTitle(false)
    setGoalToast('Goal title updated')
  }

  function openEditTargetDate() {
    if (!goal) return
    setGoalMenuOpen(false)
    setEditingTargetDate(true)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = formatLocalDate(today)
    const tIso =
      goal.target_date && goal.target_date.trim()
        ? goal.target_date
        : formatLocalDate(addDays(today, 90))
    setTargetDateDraft(tIso)

    const remainingDays = daysBetweenIso(todayIso, tIso)
    const preset =
      remainingDays === DURATION_PRESET_DAYS['1m']
        ? '1m'
        : remainingDays === DURATION_PRESET_DAYS['3m']
          ? '3m'
          : remainingDays === DURATION_PRESET_DAYS['6m']
            ? '6m'
            : remainingDays === DURATION_PRESET_DAYS['1y']
              ? '1y'
              : null
    if (preset) {
      setTargetMode('preset')
      setTargetPreset(preset)
    } else {
      setTargetMode('custom')
    }
  }

  function closeEditTargetDate() {
    setEditingTargetDate(false)
  }

  function pickTargetPreset(p: '1m' | '3m' | '6m' | '1y') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    setTargetMode('preset')
    setTargetPreset(p)
    setTargetDateDraft(formatLocalDate(addDays(today, DURATION_PRESET_DAYS[p])))
  }

  async function saveTargetDate() {
    if (!goal || !userId || !goalId) return
    const next = targetDateDraft
    if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      setError('Please pick a valid target date')
      return
    }
    setSavingTargetDate(true)
    setError(null)
    const { error: uErr } = await supabase
      .from('goals')
      .update({ target_date: next })
      .eq('id', goalId)
      .eq('user_id', userId)
    setSavingTargetDate(false)
    if (uErr) {
      setError(uErr.message)
      return
    }
    setGoal((g) => (g ? { ...g, target_date: next } : g))
    setEditingTargetDate(false)
    setGoalToast('Target date updated')
  }

  async function handleRegenerateAllMissions() {
    if (!goal || !userId || !goalId) return
    if (!goal.target_date) {
      setError('This goal has no target date to regenerate against')
      return
    }
    console.log('Starting regeneration...')
    setConfirmRegenerateOpen(false)
    setRegeneratingPlan(true)
    setError(null)
    try {
      const { data: deletedMissions, error: delMErr } = await supabase
        .from('daily_missions')
        .delete({ count: 'exact' })
        .select('id')
        .eq('goal_id', goalId)
        .eq('user_id', userId)
        .eq('completed', false)
      if (delMErr) throw new Error(delMErr.message)
      console.log(
        'Deleted incomplete missions:',
        Array.isArray(deletedMissions) ? deletedMissions.length : 0,
      )

      const { data: deletedQuests, error: delQErr } = await supabase
        .from('weekly_quests')
        .delete({ count: 'exact' })
        .select('id')
        .eq('goal_id', goalId)
        .eq('user_id', userId)
        .eq('completed', false)
      if (delQErr) throw new Error(delQErr.message)
      console.log(
        'Deleted incomplete quests:',
        Array.isArray(deletedQuests) ? deletedQuests.length : 0,
      )

      const { data: maxCompletedRow, error: maxErr } = await supabase
        .from('weekly_quests')
        .select('week_number')
        .eq('goal_id', goalId)
        .eq('user_id', userId)
        .eq('completed', true)
        .order('week_number', { ascending: false })
        .limit(1)

      if (maxErr) throw new Error(maxErr.message)

      const highestCompleted = maxCompletedRow?.[0]?.week_number ?? 0
      const totalW = calculateTotalWeeks(goal.target_date)
      const batchStart = Math.min(totalW, highestCompleted + 1)
      const batchEnd = Math.min(batchStart + 3, totalW)

      const { data: profile } = await supabase
        .from('users')
        .select('goal_context')
        .eq('id', userId)
        .maybeSingle()

      let userContext: Record<string, unknown> | undefined
      const cat = goal.category ?? 'health_habits'
      const rawCtx = profile?.goal_context
      if (
        rawCtx &&
        typeof rawCtx === 'object' &&
        !Array.isArray(rawCtx) &&
        cat in (rawCtx as object)
      ) {
        const slice = (rawCtx as Record<string, unknown>)[cat]
        if (slice && typeof slice === 'object' && !Array.isArray(slice)) {
          userContext = slice as Record<string, unknown>
        }
      }

      console.log('Calling generateMissions with:', {
        goalTitle: goal.title,
        category: cat,
        targetDate: goal.target_date,
        batchStart,
        batchEnd,
        totalW,
        highestCompleted,
        hasUserContext: userContext !== undefined,
      })

      const missions = await generateMissions(
        goal.title,
        cat,
        goal.target_date,
        userContext,
        batchStart,
        batchEnd,
        totalW,
      )
      console.log('Missions generated:', missions)

      const weeklyRows = missions.weekly_quests.map((title, i) => ({
        goal_id: goalId,
        user_id: userId,
        title,
        week_number: batchStart + i,
        completed: false,
        xp_reward: 150,
      }))

      const { error: weeklyErr } = await supabase
        .from('weekly_quests')
        .insert(weeklyRows)
      if (weeklyErr) throw new Error(weeklyErr.message)
      console.log('Saved new quests:', weeklyRows.length)

      const base = new Date()
      base.setHours(0, 0, 0, 0)
      const dailyRows = missions.daily_missions.map((title, i) => ({
        goal_id: goalId,
        user_id: userId,
        title,
        completed: false,
        xp_reward: 25,
        due_date: formatLocalDate(addDays(base, i)),
      }))
      const { error: dailyErr } = await supabase
        .from('daily_missions')
        .insert(dailyRows)
      if (dailyErr) throw new Error(dailyErr.message)
      console.log('Saved new missions:', dailyRows.length)

      await load()
      setGoalToast('Your plan has been regenerated')
      console.log('Regeneration complete')
    } catch (e) {
      console.error('Regeneration failed:', e)
      setError(e instanceof Error ? e.message : 'Could not regenerate plan')
    } finally {
      setRegeneratingPlan(false)
    }
  }

  async function handleDeleteGoal() {
    if (!goal || !userId || !goalId) return
    setConfirmDeleteOpen(false)
    setDeletingGoal(true)
    setError(null)
    try {
      const { error: dErr } = await supabase
        .from('daily_missions')
        .delete()
        .eq('goal_id', goalId)
        .eq('user_id', userId)
      if (dErr) throw new Error(dErr.message)

      const { error: wErr } = await supabase
        .from('weekly_quests')
        .delete()
        .eq('goal_id', goalId)
        .eq('user_id', userId)
      if (wErr) throw new Error(wErr.message)

      const { error: gErr } = await supabase
        .from('goals')
        .delete()
        .eq('id', goalId)
        .eq('user_id', userId)
      if (gErr) throw new Error(gErr.message)

      void navigate('/goals', { state: { toast: 'Goal deleted' } })
      // Best-effort: the screen will unmount quickly.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete goal')
      setDeletingGoal(false)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  const totalWeeks = useMemo(() => {
    if (!goal?.target_date) return Math.max(1, quests.length || 1)
    return calculateTotalWeeks(goal.target_date)
  }, [goal?.target_date, quests.length])

  const currentWeekFromStart = useMemo(() => {
    if (!goal?.created_at) return 1
    return calculateCurrentWeekFromGoalStart(goal.created_at)
  }, [goal?.created_at])

  const maxQuestWeek = useMemo(
    () =>
      quests.length > 0 ? Math.max(...quests.map((q) => q.week_number)) : 0,
    [quests],
  )

  const completedQuestCount = useMemo(
    () => quests.filter((q) => q.completed).length,
    [quests],
  )

  const sortedQuests = useMemo(
    () => [...quests].sort((a, b) => a.week_number - b.week_number),
    [quests],
  )

  const pct = useMemo(() => {
    if (!goal) return 0
    if (!goal.target_date && quests.length === 0) {
      return clampPercent(goal.progress_percent)
    }
    const tw =
      goal.target_date != null && goal.target_date !== ''
        ? calculateTotalWeeks(goal.target_date)
        : Math.max(1, quests.length)
    return calculateProgressPercent(completedQuestCount, tw)
  }, [goal, quests.length, completedQuestCount])

  const isGoalComplete =
    goal?.status === 'completed' ||
    (totalWeeks > 0 && completedQuestCount >= totalWeeks)

  const currentQuest = useMemo(
    () => pickActiveQuest(quests, currentWeekFromStart, questProgression),
    [quests, currentWeekFromStart, questProgression],
  )

  const progressAccent = getMissionBoardAccent(goal?.category)
  const barColor = isGoalComplete ? '#22c55e' : progressAccent
  const { label: catLabel, emoji: catEmoji } = getGoalCategoryDisplay(
    goal?.category,
  )

  const batchDisplayRanges = useMemo(() => {
    const span = Math.max(totalWeeks, maxQuestWeek, 1)
    return weeklyQuestBatchRanges(span)
  }, [totalWeeks, maxQuestWeek])

  useEffect(() => {
    if (loading || !goal || !userId || !goalId) return
    if (goal.status === 'completed') return
    if (!goal.target_date || !goal.created_at) return

    const totalW = calculateTotalWeeks(goal.target_date)
    const currentW = calculateCurrentWeekFromGoalStart(goal.created_at)
    const maxExisting =
      quests.length > 0 ? Math.max(...quests.map((q) => q.week_number)) : 0

    if (maxExisting === 0) return
    if (maxExisting >= totalW) return
    if (currentW < maxExisting) return

    void generateNextBatch()
  }, [loading, goal, quests, userId, goalId, generateNextBatch])

  async function handleMarkQuestComplete(quest: WeeklyQuestRow) {
    if (
      !userId ||
      !goalId ||
      !goal ||
      quest.completed ||
      markingId ||
      goal.status === 'completed'
    ) {
      return
    }

    if (
      isQuestLockedForMode(
        quest,
        sortedQuests,
        questProgression,
        currentWeekFromStart,
      )
    ) {
      return
    }

    const prevQuests = quests
    const prevGoal = goal

    const nextQuests = quests.map((q) =>
      q.id === quest.id ? { ...q, completed: true } : q,
    )
    const doneCount = nextQuests.filter((q) => q.completed).length
    const totalW =
      goal.target_date != null && goal.target_date !== ''
        ? calculateTotalWeeks(goal.target_date)
        : Math.max(1, nextQuests.length)
    const newPct = calculateProgressPercent(doneCount, totalW)
    const reached100 = doneCount >= totalW && totalW > 0
    const completedAtIso = reached100 ? new Date().toISOString() : null

    setError(null)
    setMarkingId(quest.id)

    setQuests(nextQuests)
    setGoal((g) =>
      g
        ? {
            ...g,
            progress_percent: newPct,
            status: reached100 ? 'completed' : g.status,
            completed_at: reached100 ? completedAtIso : g.completed_at,
          }
        : null,
    )

    const { error: uErr } = await supabase
      .from('weekly_quests')
      .update({ completed: true })
      .eq('id', quest.id)
      .eq('user_id', userId)
      .eq('goal_id', goalId)

    if (uErr) {
      setQuests(prevQuests)
      setGoal(prevGoal)
      setMarkingId(null)
      setError(uErr.message)
      return
    }

    const goalUpdate: {
      progress_percent: number
      status?: string
      completed_at?: string | null
    } = { progress_percent: newPct }

    if (reached100) {
      goalUpdate.status = 'completed'
      goalUpdate.completed_at = completedAtIso
    }

    const { error: gErr } = await supabase
      .from('goals')
      .update(goalUpdate)
      .eq('id', goalId)
      .eq('user_id', userId)

    if (gErr) {
      const { error: revErr } = await supabase
        .from('weekly_quests')
        .update({ completed: false })
        .eq('id', quest.id)
        .eq('user_id', userId)
        .eq('goal_id', goalId)
      setQuests(prevQuests)
      setGoal(prevGoal)
      setMarkingId(null)
      setError(
        revErr
          ? `${gErr.message} (quest unlock failed: ${revErr.message})`
          : gErr.message,
      )
      return
    }

    setMarkingId(null)
    setSuccessFlashId(quest.id)
    window.setTimeout(() => setSuccessFlashId(null), 1200)

    void (async () => {
      try {
        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser()
        if (authErr || !user?.id) {
          console.error(
            'Quest XP skipped: no auth session',
            authErr?.message ?? 'missing user',
          )
          return
        }
        if (user.id !== userId) {
          console.error(
            'Quest XP skipped: auth user id mismatch',
            user.id,
            userId,
          )
          return
        }

        console.log('Awarding quest XP...')
        await awardXP(user.id, 150, 'weekly_quest_complete')
        console.log('Quest XP awarded, showing toast')
        enqueueXpToast(150)
      } catch (xpErr) {
        console.error('XP award failed (weekly quest):', xpErr)
      }
    })()

    // If all existing quests are now complete but more weeks remain in the
    // goal, immediately generate the next batch regardless of progression
    // mode so the UI has something actionable.
    if (goal.target_date) {
      const maxExistingWeek =
        nextQuests.length > 0
          ? Math.max(...nextQuests.map((q) => q.week_number))
          : 0
      const totalWeeksForGoal = calculateTotalWeeks(goal.target_date)
      const allCurrentComplete = doneCount === nextQuests.length

      if (allCurrentComplete && maxExistingWeek < totalWeeksForGoal) {
        void generateNextBatch()
      }
    }
  }

  function closeQuestMenu() {
    setQuestMenuOpenId(null)
  }

  function beginEditQuest(q: WeeklyQuestRow) {
    closeQuestMenu()
    setEditingQuestId(q.id)
    setQuestTitleDraft(q.title ?? '')
  }

  function cancelEditQuest() {
    setEditingQuestId(null)
    setQuestTitleDraft('')
  }

  async function saveQuestTitle(questId: string) {
    if (!userId || !goalId) return
    const next = questTitleDraft.trim()
    if (!next) {
      setError('Quest title cannot be empty')
      return
    }
    setSavingQuestId(questId)
    setError(null)
    const { error: uErr } = await supabase
      .from('weekly_quests')
      .update({ title: next })
      .eq('id', questId)
      .eq('goal_id', goalId)
      .eq('user_id', userId)
    setSavingQuestId(null)
    if (uErr) {
      setError(uErr.message)
      return
    }
    setQuests((prev) => prev.map((q) => (q.id === questId ? { ...q, title: next } : q)))
    setEditingQuestId(null)
    setQuestTitleDraft('')
  }

  async function regenerateQuest(q: WeeklyQuestRow) {
    if (!goal || !userId || !goalId) return
    closeQuestMenu()
    setRegeneratingQuestId(q.id)
    setError(null)
    try {
      const nextTitle = await generateOneWeeklyQuestTitle({
        goalTitle: goal.title,
        category: goal.category ?? 'health_habits',
        weekNumber: q.week_number,
        totalWeeks,
        avoidTitles: quests.map((x) => x.title),
      })

      const { error: uErr } = await supabase
        .from('weekly_quests')
        .update({ title: nextTitle })
        .eq('id', q.id)
        .eq('goal_id', goalId)
        .eq('user_id', userId)
      if (uErr) throw new Error(uErr.message)

      setQuests((prev) => prev.map((x) => (x.id === q.id ? { ...x, title: nextTitle } : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not regenerate quest')
    } finally {
      setRegeneratingQuestId(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      {xpToast ? (
        xpToast.payload.kind === 'xp' ? (
          <XPToast
            key={xpToast.key}
            variant="xp"
            amount={xpToast.payload.amount}
            visible
            onHide={onXpToastHide}
          />
        ) : (
          <XPToast
            key={xpToast.key}
            variant="streak"
            message={xpToast.payload.message}
            accentColor={xpToast.payload.accentColor}
            visible
            onHide={onXpToastHide}
          />
        )
      ) : null}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/60 px-2 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to="/goals"
          aria-label="Back to goals"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>

        <button
          type="button"
          aria-label="Goal options"
          aria-expanded={goalMenuOpen}
          disabled={loading || deletingGoal || regeneratingPlan}
          onClick={() => setGoalMenuOpen((v) => !v)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white disabled:opacity-50"
        >
          <span className="text-2xl leading-none" aria-hidden>
            ⋯
          </span>
        </button>
      </header>

      {goalMenuOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: OVERLAY_BG }}
            aria-label="Close goal menu"
            onClick={() => setGoalMenuOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-zinc-800/80 bg-app-bg shadow-2xl">
            <div className="mx-auto mb-2 mt-3 h-1.5 w-10 rounded-full bg-zinc-700" />
            <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
              <button
                type="button"
                onClick={openEditGoalTitle}
                className="w-full rounded-xl border border-zinc-800 bg-app-surface px-4 py-4 text-left text-sm font-bold text-white"
              >
                Edit Goal Title
              </button>
              <button
                type="button"
                onClick={openEditTargetDate}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-app-surface px-4 py-4 text-left text-sm font-bold text-white"
              >
                Change Target Date
              </button>
              <button
                type="button"
                onClick={() => {
                  setGoalMenuOpen(false)
                  setConfirmRegenerateOpen(true)
                }}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-app-surface px-4 py-4 text-left text-sm font-bold text-white"
              >
                Regenerate All Missions
              </button>
              <button
                type="button"
                onClick={() => {
                  setGoalMenuOpen(false)
                  setConfirmDeleteOpen(true)
                }}
                className="mt-2 w-full rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-4 text-left text-sm font-bold text-red-300 ring-1 ring-red-500/25"
              >
                Delete Goal
              </button>
              <button
                type="button"
                onClick={() => setGoalMenuOpen(false)}
                className="mt-3 w-full pb-2 text-center text-sm font-semibold text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingTargetDate ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: OVERLAY_BG }}
            aria-label="Close target date editor"
            onClick={closeEditTargetDate}
            disabled={savingTargetDate}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-zinc-800/80 bg-app-bg shadow-2xl">
            <div className="mx-auto mb-2 mt-3 h-1.5 w-10 rounded-full bg-zinc-700" />
            <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
              <h3 className="text-lg font-bold text-white">Target date</h3>
              <p className="mt-1 text-sm font-medium text-zinc-500">
                Choose how long you want to work on this goal
              </p>

              <div className="mt-4 flex flex-wrap gap-2" role="group">
                {(
                  [
                    ['1m', '1 Month'],
                    ['3m', '3 Months'],
                    ['6m', '6 Months'],
                    ['1y', '1 Year'],
                  ] as const
                ).map(([id, label]) => {
                  const selected = targetMode === 'preset' && targetPreset === id
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={savingTargetDate}
                      aria-pressed={selected}
                      onClick={() => pickTargetPreset(id)}
                      className={[
                        'rounded-full border-2 px-3 py-2.5 text-sm font-bold text-white transition-colors active:scale-[0.98] disabled:opacity-50',
                        selected
                          ? ''
                          : 'border-zinc-800 bg-app-surface hover:border-zinc-700',
                      ].join(' ')}
                      style={
                        selected
                          ? {
                              borderColor: QUEST_PURPLE,
                              backgroundColor: 'rgba(83, 74, 183, 0.14)',
                            }
                          : undefined
                      }
                    >
                      {label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  disabled={savingTargetDate}
                  aria-pressed={targetMode === 'custom'}
                  onClick={() => setTargetMode('custom')}
                  className={[
                    'rounded-full border-2 px-3 py-2.5 text-sm font-bold text-white transition-colors active:scale-[0.98] disabled:opacity-50',
                    targetMode === 'custom'
                      ? ''
                      : 'border-zinc-800 bg-app-surface hover:border-zinc-700',
                  ].join(' ')}
                  style={
                    targetMode === 'custom'
                      ? {
                          borderColor: QUEST_PURPLE,
                          backgroundColor: 'rgba(83, 74, 183, 0.14)',
                        }
                      : undefined
                  }
                >
                  Custom
                </button>
              </div>

              {targetMode === 'custom' ? (
                <div className="mt-4">
                  <label
                    htmlFor="target-date-custom"
                    className="text-sm font-semibold text-zinc-200"
                  >
                    Target date
                  </label>
                  <input
                    id="target-date-custom"
                    type="date"
                    value={targetDateDraft}
                    onChange={(e) => setTargetDateDraft(e.target.value)}
                    disabled={savingTargetDate}
                    className="mt-2 w-full rounded-xl border border-zinc-800 bg-app-surface px-4 py-3.5 text-base font-medium text-white outline-none focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 [color-scheme:dark] disabled:opacity-50"
                  />
                </div>
              ) : null}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveTargetDate()}
                  disabled={savingTargetDate}
                  className="flex-1 rounded-xl bg-white py-3.5 text-sm font-bold text-app-bg disabled:opacity-50"
                >
                  {savingTargetDate ? 'Saving…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={closeEditTargetDate}
                  disabled={savingTargetDate}
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/40 py-3.5 text-sm font-bold text-zinc-300 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {confirmRegenerateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: OVERLAY_BG }}
            aria-label="Close regenerate confirmation"
            onClick={() => setConfirmRegenerateOpen(false)}
            disabled={regeneratingPlan}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-800/80 bg-app-bg p-5 shadow-2xl">
            <p className="text-base font-bold text-white">
              Regenerate your plan?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              This will replace all incomplete missions and quests with a fresh
              AI-generated plan. Completed quests will be kept. Are you sure?
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void handleRegenerateAllMissions()}
                disabled={regeneratingPlan}
                className="flex-1 rounded-xl bg-white py-3.5 text-sm font-bold text-app-bg disabled:opacity-50"
              >
                {regeneratingPlan ? 'Regenerating your plan…' : 'Yes, regenerate'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRegenerateOpen(false)}
                disabled={regeneratingPlan}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/40 py-3.5 text-sm font-bold text-zinc-300 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: OVERLAY_BG }}
            aria-label="Close delete confirmation"
            onClick={() => setConfirmDeleteOpen(false)}
            disabled={deletingGoal}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-800/80 bg-app-bg p-5 shadow-2xl">
            <p className="text-base font-bold text-white">
              Delete {goal ? `"${goal.title}"` : 'this goal'}?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              This will permanently delete this goal and all its missions and
              quests. This cannot be undone.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void handleDeleteGoal()}
                disabled={deletingGoal}
                className="flex-1 rounded-xl bg-red-500 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {deletingGoal ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={deletingGoal}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/40 px-4 py-3.5 text-sm font-bold text-zinc-300 disabled:opacity-50"
              >
                Keep goal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {questMenuOpenId ? (
        <button
          type="button"
          className="fixed inset-0 z-40"
          aria-label="Close quest menu"
          onClick={closeQuestMenu}
        />
      ) : null}

      {loading ? (
        <DetailSkeleton />
      ) : error && !goal ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800/80 bg-app-surface px-6 py-8 text-center shadow-lg ring-1 ring-zinc-800/40">
            <p className="text-lg font-bold text-white">
              Couldn&apos;t load goal
            </p>
            <p className="mt-2 text-sm text-zinc-500">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-6 w-full rounded-xl bg-white py-3.5 text-sm font-bold text-app-bg"
            >
              Retry
            </button>
            <Link
              to="/goals"
              className="mt-3 block text-sm font-semibold text-zinc-400 hover:text-white"
            >
              Back to Goals
            </Link>
          </div>
        </div>
      ) : goal ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10">
          {error ? (
            <div className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-amber-100/90">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="shrink-0 rounded-lg bg-white/10 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-white/20"
              >
                Retry
              </button>
            </div>
          ) : null}

          {batchUnlockBanner ? (
            <div
              className="mb-4 rounded-xl border border-app-accent/35 bg-app-accent/15 px-4 py-3 text-center text-sm font-semibold text-zinc-100 ring-1 ring-app-accent/25"
              role="status"
            >
              {batchUnlockBanner}
            </div>
          ) : null}

          {nextBatchError ? (
            <p className="mb-3 text-center text-xs font-medium text-amber-400/90">
              {nextBatchError}
            </p>
          ) : null}

          {goalToast ? (
            <div
              className="mb-4 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-center text-sm font-semibold text-emerald-200 ring-1 ring-emerald-500/25"
              role="status"
            >
              {goalToast}
            </div>
          ) : null}

          <section className="pt-2">
            {editingGoalTitle ? (
              <div className="max-w-lg">
                <label
                  htmlFor="goal-title-edit"
                  className="sr-only"
                >
                  Goal title
                </label>
                <input
                  id="goal-title-edit"
                  type="text"
                  value={goalTitleDraft}
                  onChange={(e) => setGoalTitleDraft(e.target.value)}
                  disabled={savingGoalTitle}
                  className="w-full rounded-xl border border-zinc-800 bg-app-surface px-4 py-3 text-xl font-bold text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 disabled:opacity-50 sm:text-2xl"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveGoalTitle()}
                    disabled={savingGoalTitle}
                    className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-app-bg disabled:opacity-50"
                  >
                    {savingGoalTitle ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={closeEditGoalTitle}
                    disabled={savingGoalTitle}
                    className="rounded-xl border border-zinc-700 bg-zinc-800/40 px-5 py-3 text-sm font-bold text-zinc-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
                {goal.title}
              </h1>
            )}
            <p className="mt-2 text-base font-medium text-zinc-500">
              <span aria-hidden>{catEmoji}</span>{' '}
              <span className="text-zinc-400">{catLabel}</span>
            </p>
            <p className="mt-2 text-sm font-semibold text-zinc-400">
              Week {currentWeekFromStart} of {totalWeeks}
            </p>
            <p className="mt-2 text-sm font-semibold text-zinc-500">
              Due{' '}
              <span className="text-zinc-300">
                {formatDueDate(goal.target_date)}
              </span>
            </p>

            <div className="mt-5 flex max-w-lg items-center gap-3">
              <div
                className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-zinc-300">
                {pct}%
              </span>
            </div>
            {isGoalComplete ? (
              <div
                className="mt-4 max-w-lg rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-center text-sm font-bold text-emerald-200 ring-1 ring-emerald-500/30"
                role="status"
              >
                Goal Complete!
              </div>
            ) : null}
          </section>

          <section className="mt-10">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
              This Week&apos;s Quest
            </h2>
            {currentQuest ? (
              (() => {
                const questLocked = isQuestLockedForMode(
                  currentQuest,
                  sortedQuests,
                  questProgression,
                  currentWeekFromStart,
                )
                return (
                  <div
                    className={[
                      'mt-3 flex flex-col gap-4 rounded-2xl border border-zinc-800/80 bg-app-surface p-4 shadow-md ring-1 ring-zinc-800/40 transition-[transform,box-shadow] duration-300 sm:flex-row sm:items-center sm:justify-between',
                      currentQuest.completed ? 'opacity-60' : '',
                      questLocked ? 'opacity-40' : '',
                      successFlashId === currentQuest.id
                        ? 'scale-[1.02] shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500/50'
                        : '',
                    ].join(' ')}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={[
                          'text-lg font-bold text-white',
                          currentQuest.completed ? 'line-through' : '',
                        ].join(' ')}
                      >
                        {currentQuest.title}
                      </p>
                      <p className="mt-1 text-sm font-medium text-zinc-500">
                        Week {currentQuest.week_number} of {totalWeeks}
                      </p>
                      {questLocked ? (
                        <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-zinc-500">
                          <LockIcon className="h-4 w-4 shrink-0" />
                          {questProgression === 'weekly'
                            ? formatUnlocksLabel(
                                goal.created_at,
                                currentQuest.week_number,
                              )
                            : 'Complete the previous quest to unlock'}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 sm:pl-2">
                      {currentQuest.completed ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-4 py-2 text-sm font-bold text-emerald-400 ring-1 ring-emerald-500/40">
                          Completed
                        </span>
                      ) : questLocked ? null : (
                        <button
                          type="button"
                          disabled={!!markingId}
                          onClick={() =>
                            void handleMarkQuestComplete(currentQuest)
                          }
                          className="w-full rounded-xl px-5 py-3 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                          style={{ backgroundColor: QUEST_PURPLE }}
                        >
                          {markingId === currentQuest.id
                            ? 'Saving…'
                            : 'Mark Complete'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()
            ) : error && quests.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                Weekly quests couldn&apos;t be loaded. Tap Retry above.
              </p>
            ) : quests.length > 0 ? (
              <p className="mt-3 text-sm font-semibold text-zinc-500">
                You&apos;re all caught up on quests for now.
              </p>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">
                No weekly quests for this goal yet.
              </p>
            )}
          </section>

          <section className="mt-10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                All Quests
              </h2>
              {generatingNextBatch ? (
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500"
                  aria-live="polite"
                >
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                  Generating…
                </span>
              ) : null}
            </div>

            {batchDisplayRanges.map((range) => {
              const inBatch = quests.filter(
                (q) =>
                  q.week_number >= range.start && q.week_number <= range.end,
              )
              if (inBatch.length === 0) return null
              return (
                <div key={`${range.start}-${range.end}`} className="mt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                    Weeks {range.start}–{range.end}
                  </p>
                  <ul className="space-y-2">
                    {inBatch.map((q) => {
                      const questLocked = isQuestLockedForMode(
                        q,
                        sortedQuests,
                        questProgression,
                        currentWeekFromStart,
                      )
                      const isHighlighted =
                        q.id === currentQuest?.id && !questLocked
                      const menuOpen = questMenuOpenId === q.id
                      const isEditing = editingQuestId === q.id
                      const savingThis = savingQuestId === q.id
                      const regeneratingThis = regeneratingQuestId === q.id
                      return (
                        <li
                          key={q.id}
                          className={[
                            'relative flex items-start gap-3 rounded-xl border bg-app-surface px-4 py-3 transition-opacity',
                            questLocked
                              ? 'border-zinc-800/80 opacity-40'
                              : q.completed
                                ? 'border-zinc-800/60 opacity-50'
                                : 'border-zinc-800/80',
                            isHighlighted
                              ? 'border-[#534AB7]/45 shadow-[0_0_0_1px_rgba(83,74,183,0.2)]'
                              : '',
                          ].join(' ')}
                        >
                          <span className="mt-0.5 shrink-0 text-zinc-500">
                            {q.completed ? (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                                <CheckIcon className="h-4 w-4" />
                              </span>
                            ) : questLocked ? (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-zinc-600 text-zinc-500">
                                <LockIcon className="h-3.5 w-3.5" />
                              </span>
                            ) : (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-zinc-600" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Week {q.week_number}
                            </p>
                            {isEditing ? (
                              <div className="mt-1">
                                <label
                                  htmlFor={`quest-edit-${q.id}`}
                                  className="sr-only"
                                >
                                  Quest title
                                </label>
                                <input
                                  id={`quest-edit-${q.id}`}
                                  type="text"
                                  value={questTitleDraft}
                                  onChange={(e) =>
                                    setQuestTitleDraft(e.target.value)
                                  }
                                  disabled={savingThis}
                                  className="w-full rounded-xl border border-zinc-800 bg-app-surface px-3 py-2.5 text-sm font-semibold text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30 disabled:opacity-50"
                                />
                                <div className="mt-2 flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => void saveQuestTitle(q.id)}
                                    disabled={savingThis}
                                    className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-app-bg disabled:opacity-50"
                                  >
                                    {savingThis ? 'Saving…' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditQuest}
                                    disabled={savingThis}
                                    className="text-xs font-semibold text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p
                                className={[
                                  'mt-0.5 text-sm font-semibold text-zinc-200',
                                  q.completed ? 'line-through' : '',
                                ].join(' ')}
                              >
                                {regeneratingThis ? 'Regenerating…' : q.title}
                              </p>
                            )}
                            {questLocked ? (
                              <p className="mt-1.5 text-xs font-semibold text-zinc-500">
                                {questProgression === 'weekly'
                                  ? formatUnlocksLabel(
                                      goal.created_at,
                                      q.week_number,
                                    )
                                  : 'Complete the previous quest to unlock'}
                              </p>
                            ) : null}
                          </div>

                          {!q.completed && !isEditing ? (
                            <div className="shrink-0">
                              <button
                                type="button"
                                aria-label="Quest options"
                                aria-expanded={menuOpen}
                                disabled={!!regeneratingQuestId || !!savingQuestId}
                                onClick={() =>
                                  setQuestMenuOpenId((prev) =>
                                    prev === q.id ? null : q.id,
                                  )
                                }
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200 disabled:opacity-50"
                              >
                                <span className="text-xl leading-none" aria-hidden>
                                  ⋯
                                </span>
                              </button>

                              {menuOpen ? (
                                <div className="absolute right-3 top-12 z-50 w-52 overflow-hidden rounded-xl border border-zinc-800 bg-app-bg shadow-2xl">
                                  <button
                                    type="button"
                                    onClick={() => beginEditQuest(q)}
                                    className="w-full px-4 py-3 text-left text-sm font-semibold text-white hover:bg-zinc-900/60"
                                  >
                                    Edit quest title
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void regenerateQuest(q)}
                                    disabled={!!regeneratingQuestId}
                                    className="w-full px-4 py-3 text-left text-sm font-semibold text-white hover:bg-zinc-900/60 disabled:opacity-50"
                                  >
                                    Regenerate this quest
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}

            {quests.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No quests listed.</p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
