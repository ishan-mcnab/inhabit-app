/** Local calendar date (no time). */
function localDateParts(d: Date): { y: number; m: number; day: number } {
  return { y: d.getFullYear(), m: d.getMonth(), day: d.getDate() }
}

function formatShortMonthDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function padYmd(y: number, m: number, day: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Monday 00:00:00 local of the week containing `date` (Mon–Sun week). */
export function startOfLocalWeekMonday(date: Date = new Date()): Date {
  const { y, m, day } = localDateParts(date)
  const d = new Date(y, m, day)
  const dow = d.getDay()
  const daysFromMonday = (dow + 6) % 7
  d.setDate(d.getDate() - daysFromMonday)
  d.setHours(0, 0, 0, 0)
  return d
}

export function localWeekMondaySundayYmd(date: Date = new Date()): {
  mon: string
  sun: string
} {
  const mon = startOfLocalWeekMonday(date)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const a = localDateParts(mon)
  const b = localDateParts(sun)
  return { mon: padYmd(a.y, a.m, a.day), sun: padYmd(b.y, b.m, b.day) }
}

/** e.g. "Week of Mar 31 — Apr 6" for the Mon–Sun week containing `date`. */
export function formatWeekOfRangeLabel(date: Date = new Date()): string {
  const mon = startOfLocalWeekMonday(date)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return `Week of ${formatShortMonthDay(mon)} — ${formatShortMonthDay(sun)}`
}

/** ISO week-year for a local calendar day (week of the Thursday in that week). */
export function getLocalISOWeekYear(d: Date): number {
  const { y, m, day } = localDateParts(d)
  const date = new Date(y, m, day)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  return date.getFullYear()
}

/** ISO week number 1–53 for a local calendar day. */
export function getLocalISOWeek(d: Date): number {
  const { y, m, day } = localDateParts(d)
  const date = new Date(y, m, day)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const week1 = new Date(date.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86_400_000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  )
}

export function previousIsoWeek(
  week: number,
  isoYear: number,
): { week: number; isoYear: number } {
  if (week > 1) return { week: week - 1, isoYear }
  const dec31 = new Date(isoYear - 1, 11, 31)
  return {
    week: getLocalISOWeek(dec31),
    isoYear: getLocalISOWeekYear(dec31),
  }
}

/** Monday of ISO week `week` in ISO year `isoYear` (local). */
export function mondayOfIsoWeek(isoYear: number, week: number): Date {
  const jan4 = new Date(isoYear, 0, 4)
  const day = jan4.getDay() === 0 ? 7 : jan4.getDay()
  const w1Mon = new Date(jan4)
  w1Mon.setDate(jan4.getDate() - day + 1)
  w1Mon.setHours(0, 0, 0, 0)
  const mon = new Date(w1Mon)
  mon.setDate(w1Mon.getDate() + (week - 1) * 7)
  return mon
}

export function formatIsoWeekRangeLabel(isoYear: number, week: number): string {
  const mon = mondayOfIsoWeek(isoYear, week)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return `${formatShortMonthDay(mon)} — ${formatShortMonthDay(sun)}`
}
