/** True if a goal_context category slice has any user-entered answers (strings or string arrays). */
export function goalContextSliceHasAnswers(slice: unknown): boolean {
  if (!slice || typeof slice !== 'object' || Array.isArray(slice)) {
    return false
  }
  return Object.values(slice as Record<string, unknown>).some((v) => {
    if (typeof v === 'string') return v.trim().length > 0
    if (Array.isArray(v)) {
      return v.some((x) => typeof x === 'string' && x.trim().length > 0)
    }
    return false
  })
}
