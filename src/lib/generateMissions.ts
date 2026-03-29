import { calculateTotalWeeks } from './goalProgress'
import { cleanModelJsonContent } from './parseModelJson'

export type GeneratedMissions = {
  weekly_quests: string[]
  daily_missions: [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ]
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-3-haiku'

const SYSTEM_PROMPT =
  'You are an elite personal coach and life optimization expert ' +
  'specializing in helping young men build discipline and achieve ' +
  'their goals. You create highly specific, cohesive, and progressive ' +
  "plans that are tailored to the individual's exact situation.\n\n" +
  'Your plans must follow these rules:\n' +
  '1. COHESION — habits that work together must run concurrently ' +
  'within the batch, never sequentially when they support each other.\n' +
  '2. PROGRESSION — each week in the batch must build on the previous week.\n' +
  '3. SPECIFICITY — every mission and quest title must be specific ' +
  "to this person's exact situation. Never write generic advice " +
  "like 'start exercising' — write 'complete 3 sets of 8 push-ups " +
  "before breakfast' instead.\n" +
  '4. PRACTICALITY — every daily mission must be something the ' +
  'person can realistically complete in a single day given their ' +
  'available time and resources.\n' +
  "5. PERSONALIZATION — reference the user's specific context in " +
  'the missions wherever possible.\n' +
  '6. NO CONTRADICTIONS — never contradict earlier weeks of the goal.\n' +
  "7. DIRECT TONE — be commanding and direct. No soft language " +
  "like 'consider trying' or 'you might want to'. Say 'do this'.\n\n" +
  'You MUST use double quotes for all JSON strings, never single ' +
  'quotes. Your entire response must be valid JSON that can be ' +
  'parsed by JSON.parse() without any modifications.'

function daysUntilTarget(targetDateStr: string): number {
  const parts = targetDateStr.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0
  const [y, m, d] = parts
  const target = new Date(y, m - 1, d)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const ms = target.getTime() - today.getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

function str(
  ctx: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!ctx) return undefined
  for (const k of keys) {
    const v = ctx[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

function contextHasData(ctx: Record<string, unknown> | undefined): boolean {
  if (!ctx || typeof ctx !== 'object') return false
  return Object.values(ctx).some(
    (v) => typeof v === 'string' && v.trim().length > 0,
  )
}

function appendCategoryContext(
  category: string,
  userContext?: Record<string, unknown>,
): string {
  if (!userContext || !contextHasData(userContext)) return ''

  switch (category) {
    case 'health_habits': {
      const focus = str(userContext, 'focus_area')
      const consistency = str(
        userContext,
        'consistency_level',
        'current_consistency',
      )
      const extra = str(userContext, 'constraints', 'additional_info')
      if (!focus && !consistency && !extra) return ''
      let s =
        '\n\nAbout this person:\n' +
        (focus ? `- Primary focus area: ${focus}\n` : '') +
        (consistency ? `- Current consistency: ${consistency}\n` : '')
      if (extra) s += `- Constraints: ${extra}\n`
      s +=
        '\nAddress their primary focus area from day 1 while building ' +
        'supporting habits around it.'
      return s
    }
    case 'skills_growth': {
      const learning = str(userContext, 'learning_focus')
      const time = str(userContext, 'time_per_day', 'daily_time')
      const level = str(userContext, 'current_level')
      const res = str(userContext, 'resources', 'additional_info')
      if (!learning && !time && !level && !res) return ''
      let s =
        '\n\nAbout this person:\n' +
        (learning ? `- Specifically learning/building: ${learning}\n` : '') +
        (time ? `- Available time per day: ${time}\n` : '') +
        (level ? `- Current level: ${level}\n` : '')
      if (res) s += `- Current resources: ${res}\n`
      s +=
        '\nBuild a progressive curriculum starting from their current ' +
        'level. Daily missions should feel like a structured course, ' +
        'not random tasks.'
      return s
    }
    case 'building_confidence': {
      const blocker = str(
        userContext,
        'biggest_blocker',
        'main_blocker',
      )
      const conf = str(userContext, 'confidence_level')
      const stage = str(userContext, 'life_stage')
      const spec = str(userContext, 'specific_work', 'additional_info')
      if (!blocker && !conf && !stage && !spec) return ''
      let s =
        '\n\nAbout this person:\n' +
        (blocker ? `- Main blocker: ${blocker}\n` : '') +
        (conf ? `- Current confidence level: ${conf}\n` : '') +
        (stage ? `- Life stage: ${stage}\n` : '')
      if (spec) s += `- Specific focus: ${spec}\n`
      s +=
        '\nCreate missions that progressively push their comfort zone ' +
        'in the specific area they struggle with most.'
      return s
    }
    case 'mental_emotional_health': {
      const driver = str(
        userContext,
        'driving_factor',
        'primary_driver',
      )
      const exp = str(userContext, 'previous_experience')
      const time = str(userContext, 'time_commitment', 'daily_time')
      const spec = str(userContext, 'specific_address', 'additional_info')
      if (!driver && !exp && !time && !spec) return ''
      let s =
        '\n\nAbout this person:\n' +
        (driver ? `- Primary driver: ${driver}\n` : '') +
        (exp ? `- Previous experience: ${exp}\n` : '') +
        (time ? `- Daily time available: ${time}\n` : '')
      if (spec) s += `- Specific focus: ${spec}\n`
      s +=
        '\nStart with accessible practices given their experience level ' +
        'and scale up progressively. Never suggest practices that ' +
        'require more time than they have available.'
      return s
    }
    case 'financial_goals': {
      const main = str(userContext, 'main_focus')
      const situation = str(userContext, 'current_situation')
      const track = str(userContext, 'tracks_spending')
      const savings = str(userContext, 'savings_target')
      const extra = str(userContext, 'additional_info')
      if (!main && !situation && !track && !savings && !extra) return ''
      let s =
        '\n\nAbout this person:\n' +
        (main ? `- Main focus: ${main}\n` : '') +
        (situation ? `- Current situation: ${situation}\n` : '') +
        (track ? `- Currently tracks spending: ${track}\n` : '')
      if (savings) s += `- Savings target: ${savings}\n`
      if (extra) s += `- Additional context: ${extra}\n`
      s +=
        '\nBuild a realistic financial plan suited to their income ' +
        "situation. Never suggest investing significant money if " +
        "they're a student or on part-time income."
      return s
    }
    default:
      return ''
  }
}

function buildBatchPhaseInstructions(
  batchStartWeek: number,
  totalWeeks: number,
): string {
  if (batchStartWeek === 1) {
    return (
      'These are the foundation weeks — establish core habits and ' +
      'baseline behaviors. Start achievable and build momentum.\n\n'
    )
  }
  if (batchStartWeek > totalWeeks / 2) {
    return (
      'The user is in the final stretch. Push harder. These quests ' +
      'should reflect serious progress and preparation for completion.\n\n'
    )
  }
  if (batchStartWeek > 1) {
    return (
      'The user is in the building phase. Increase intensity and ' +
      'complexity compared to earlier weeks. Reference that they ' +
      'should already have the foundations from week 1.\n\n'
    )
  }
  return ''
}

function buildWeeklyJsonExampleLines(
  batchStartWeek: number,
  batchSize: number,
): string {
  const lines: string[] = []
  for (let i = 0; i < batchSize; i++) {
    const w = batchStartWeek + i
    lines.push(
      `    "Week ${w}: [specific milestone title for week ${w}]"`,
    )
  }
  return lines.join(',\n')
}

function buildUserPrompt(
  goalTitle: string,
  category: string,
  targetDate: string,
  batchStartWeek: number,
  batchEndWeek: number,
  totalWeeks: number,
  userContext?: Record<string, any>,
): string {
  const batchSize = batchEndWeek - batchStartWeek + 1
  const days = daysUntilTarget(targetDate)
  const ctxObj =
    userContext && typeof userContext === 'object' && !Array.isArray(userContext)
      ? (userContext as Record<string, unknown>)
      : undefined

  const dailyBlock =
    '    "Specific actionable task 1 — doable in one day",\n' +
    '    "Specific actionable task 2 — doable in one day",\n' +
    '    "Specific actionable task 3 — doable in one day",\n' +
    '    "Specific actionable task 4 — doable in one day",\n' +
    '    "Specific actionable task 5 — doable in one day",\n' +
    '    "Specific actionable task 6 — doable in one day",\n' +
    '    "Specific actionable task 7 — doable in one day"'

  let prompt =
    `Create a progressive plan for weeks ${batchStartWeek} through ${batchEndWeek} of a ${totalWeeks}-week goal.\n\n` +
    `This is week ${batchStartWeek}-${batchEndWeek} out of ${totalWeeks} total weeks.\n\n` +
    buildBatchPhaseInstructions(batchStartWeek, totalWeeks) +
    `Goal: '${goalTitle}'\n` +
    `Category: ${category}\n` +
    `Target completion date: ${targetDate}\n` +
    `Days until target: ${days}`

  prompt += appendCategoryContext(category, ctxObj)

  prompt +=
    `\n\nReturn exactly ${batchSize} weekly_quests (not always 4 — match the batch size exactly) and always exactly 7 daily_missions.\n` +
    'Weekly quest titles must include the week number in this form: ' +
    "'Week [n]: [specific milestone title]'\n\n" +
    'Return ONLY a valid JSON object with no extra text, no markdown, ' +
    'no backticks (use double quotes only):\n' +
    '{\n' +
    '  "weekly_quests": [\n' +
    buildWeeklyJsonExampleLines(batchStartWeek, batchSize) +
    '\n  ],\n' +
    '  "daily_missions": [\n' +
    dailyBlock +
    '\n  ]\n' +
    '}\n\n' +
    'Daily missions are foundational habits for this goal that repeat every week. ' +
    'They must be specific enough that the user knows exactly what to do.'

  return prompt
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function skipAsciiWs(s: string, i: number): number {
  let j = i
  while (
    j < s.length &&
    (s[j] === ' ' || s[j] === '\n' || s[j] === '\r' || s[j] === '\t')
  ) {
    j++
  }
  return j
}

function readJsonLikeString(
  s: string,
  i: number,
): { value: string; next: number } | null {
  if (i >= s.length) return null
  const q = s[i]
  if (q !== "'" && q !== '"') return null
  let j = i + 1
  let out = ''
  while (j < s.length) {
    const c = s[j]
    if (c === '\\' && j + 1 < s.length) {
      const n = s[j + 1]
      if (n === '\\' || n === "'" || n === '"') {
        out += n
        j += 2
        continue
      }
      out += n
      j += 2
      continue
    }
    if (c === q) {
      return { value: out, next: j + 1 }
    }
    out += c
    j++
  }
  return null
}

function parseBracketQuotedStringArray(
  s: string,
  openBracketIdx: number,
): string[] | null {
  if (s[openBracketIdx] !== '[') return null
  let i = openBracketIdx + 1
  const out: string[] = []
  while (true) {
    i = skipAsciiWs(s, i)
    if (i >= s.length) return null
    if (s[i] === ']') break
    const read = readJsonLikeString(s, i)
    if (!read) return null
    out.push(read.value)
    i = skipAsciiWs(s, read.next)
    if (i < s.length && s[i] === ',') {
      i++
      continue
    }
    i = skipAsciiWs(s, i)
    if (i < s.length && s[i] === ']') break
    return null
  }
  return out.length > 0 ? out : null
}

function indexOfKeyArrayBracket(content: string, key: string): number {
  const re = new RegExp(
    `(?:['"]?)${escapeRegExp(key)}(?:['"]?)\\s*:\\s*\\[`,
    'i',
  )
  const m = re.exec(content)
  if (!m || m.index === undefined) return -1
  return m.index + m[0].length - 1
}

function extractMissionsWithRegex(
  content: string,
  expectedWeekly: number,
): unknown | null {
  const wBracket = indexOfKeyArrayBracket(content, 'weekly_quests')
  if (wBracket < 0) return null
  const weekly = parseBracketQuotedStringArray(content, wBracket)
  if (!weekly || weekly.length !== expectedWeekly) return null

  const dBracket = indexOfKeyArrayBracket(content, 'daily_missions')
  if (dBracket < 0) return null
  const daily = parseBracketQuotedStringArray(content, dBracket)
  if (!daily || daily.length !== 7) return null

  return { weekly_quests: weekly, daily_missions: daily }
}

function assertGeneratedMissions(
  parsed: unknown,
  expectedWeekly: number,
): GeneratedMissions {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('generateMissions: response is not a JSON object')
  }
  const o = parsed as Record<string, unknown>
  const weekly = o.weekly_quests
  const daily = o.daily_missions
  if (!isStringArray(weekly) || weekly.length !== expectedWeekly) {
    throw new Error(
      `generateMissions: expected weekly_quests to be an array of exactly ${expectedWeekly} strings, got ${weekly === undefined ? 'undefined' : Array.isArray(weekly) ? `length ${weekly.length}` : typeof weekly}`,
    )
  }
  if (!isStringArray(daily) || daily.length !== 7) {
    throw new Error(
      `generateMissions: expected daily_missions to be an array of exactly 7 strings, got ${daily === undefined ? 'undefined' : Array.isArray(daily) ? `length ${daily.length}` : typeof daily}`,
    )
  }
  return {
    weekly_quests: weekly,
    daily_missions: daily as GeneratedMissions['daily_missions'],
  }
}

function isStringArray(a: unknown): a is string[] {
  return Array.isArray(a) && a.every((x) => typeof x === 'string')
}

function tryParseMissionsJson(
  text: string,
  expectedWeekly: number,
): GeneratedMissions | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  try {
    return assertGeneratedMissions(parsed, expectedWeekly)
  } catch {
    return null
  }
}

function parseMissionsFromModelContent(
  raw: string,
  expectedWeekly: number,
): GeneratedMissions {
  const cleaned = cleanModelJsonContent(raw)

  const direct = tryParseMissionsJson(cleaned, expectedWeekly)
  if (direct) return direct

  const quoteFixed = cleaned.replace(/'/g, '"')
  const afterQuotes = tryParseMissionsJson(quoteFixed, expectedWeekly)
  if (afterQuotes) return afterQuotes

  const regexObj = extractMissionsWithRegex(cleaned, expectedWeekly)
  if (regexObj !== null) {
    try {
      return assertGeneratedMissions(regexObj, expectedWeekly)
    } catch (e) {
      const hint = e instanceof Error ? e.message : String(e)
      throw new Error(
        `generateMissions: regex extraction produced invalid shape — ${hint}`,
      )
    }
  }

  let directErr = 'n/a'
  try {
    JSON.parse(cleaned)
  } catch (e) {
    directErr = e instanceof Error ? e.message : String(e)
  }
  let fixedErr = 'n/a'
  try {
    JSON.parse(quoteFixed)
  } catch (e) {
    fixedErr = e instanceof Error ? e.message : String(e)
  }

  throw new Error(
    'generateMissions: could not parse missions JSON after: (1) direct JSON.parse, ' +
      '(2) replacing single quotes with double quotes, (3) regex array extraction. ' +
      `Direct parse error: ${directErr}. After quote replace: ${fixedErr}. ` +
      `Snippet: ${cleaned.slice(0, 280)}`,
  )
}

type OpenRouterMessage = { role: string; content: string }
type OpenRouterChoice = { message?: OpenRouterMessage }

/**
 * One batch of weekly quests (up to 4 weeks) + 7 daily missions via OpenRouter.
 */
export async function generateMissions(
  goalTitle: string,
  category: string,
  targetDate: string,
  userContext?: Record<string, any>,
  batchStartWeek: number = 1,
  batchEndWeek: number = 4,
  totalWeeks?: number,
): Promise<{
  weekly_quests: string[]
  daily_missions: string[]
}> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error(
      'generateMissions: missing VITE_OPENROUTER_API_KEY in environment',
    )
  }

  let start = batchStartWeek
  let end = batchEndWeek
  if (end < start) {
    const t = start
    start = end
    end = t
  }

  const resolvedTotal =
    totalWeeks !== undefined && totalWeeks >= 1
      ? totalWeeks
      : calculateTotalWeeks(targetDate)

  const expectedWeekly = end - start + 1

  const userPrompt = buildUserPrompt(
    goalTitle,
    category,
    targetDate,
    start,
    end,
    resolvedTotal,
    userContext,
  )

  let res: Response
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'InHabit App',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`generateMissions: network request failed — ${msg}`)
  }

  let data: unknown
  try {
    data = await res.json()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`generateMissions: failed to read response JSON — ${msg}`)
  }

  if (!res.ok) {
    const errBody =
      data && typeof data === 'object' && 'error' in data
        ? JSON.stringify((data as { error: unknown }).error)
        : JSON.stringify(data)
    throw new Error(
      `generateMissions: OpenRouter returned ${res.status} — ${errBody}`,
    )
  }

  const choices =
    data && typeof data === 'object' && 'choices' in data
      ? (data as { choices: unknown }).choices
      : undefined
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('generateMissions: no choices in API response')
  }

  const first = choices[0] as OpenRouterChoice
  const content = first?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(
      'generateMissions: missing data.choices[0].message.content string',
    )
  }

  const parsed = parseMissionsFromModelContent(content, expectedWeekly)
  return {
    weekly_quests: parsed.weekly_quests,
    daily_missions: [...parsed.daily_missions],
  }
}
