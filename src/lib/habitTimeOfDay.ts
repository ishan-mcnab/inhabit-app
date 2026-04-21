export type HabitTimeSlot = 'morning' | 'afternoon' | 'evening'

const ORDER: readonly HabitTimeSlot[] = [
  'morning',
  'afternoon',
  'evening',
] as const

const LABELS: Record<HabitTimeSlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

/** Normalize DB value: legacy single string, text[], or null → ordered unique slots (defaults to morning). */
export function normalizeHabitTimeOfDay(raw: unknown): HabitTimeSlot[] {
  if (raw == null) {
    return ['morning']
  }
  if (Array.isArray(raw)) {
    const set = new Set<HabitTimeSlot>()
    for (const x of raw) {
      if (x === 'morning' || x === 'afternoon' || x === 'evening') {
        set.add(x)
      }
    }
    const out = ORDER.filter((t) => set.has(t))
    return out.length > 0 ? [...out] : ['morning']
  }
  if (raw === 'morning' || raw === 'afternoon' || raw === 'evening') {
    return [raw]
  }
  return ['morning']
}

export function formatHabitTimeOfDayLabels(slots: HabitTimeSlot[]): string {
  return slots.map((t) => LABELS[t]).join(' · ')
}

/** Toggle a slot in the list; cannot remove the last remaining slot. */
export function toggleHabitTimeSlot(
  slots: HabitTimeSlot[],
  slot: HabitTimeSlot,
): HabitTimeSlot[] {
  if (slots.includes(slot)) {
    if (slots.length <= 1) return slots
    return normalizeHabitTimeOfDay(slots.filter((s) => s !== slot))
  }
  return normalizeHabitTimeOfDay([...slots, slot])
}
