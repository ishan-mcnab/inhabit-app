import { cleanModelJsonContent, tryParseJsonFromCleaned } from './parseModelJson'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-3-haiku'

type OpenRouterMessage = { role: string; content: string }
type OpenRouterChoice = { message?: OpenRouterMessage }

async function openRouterJson(prompt: string): Promise<unknown> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Missing VITE_OPENROUTER_API_KEY in environment')
  }

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
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`OpenRouter request failed — ${msg}`)
  }

  let data: unknown
  try {
    data = await res.json()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`OpenRouter response parse failed — ${msg}`)
  }

  if (!res.ok) {
    const errBody =
      data && typeof data === 'object' && 'error' in data
        ? JSON.stringify((data as { error: unknown }).error)
        : JSON.stringify(data)
    throw new Error(`OpenRouter returned ${res.status} — ${errBody}`)
  }

  const choices =
    data && typeof data === 'object' && 'choices' in data
      ? (data as { choices: unknown }).choices
      : undefined
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('OpenRouter returned no choices')
  }

  const first = choices[0] as OpenRouterChoice
  const content = first?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter returned empty message content')
  }

  const cleaned = cleanModelJsonContent(content)
  const parsed = tryParseJsonFromCleaned(cleaned)
  if (parsed === null) {
    throw new Error(`Could not parse model JSON. Snippet: ${cleaned.slice(0, 220)}`)
  }
  return parsed
}

export async function generateOneDailyMissionTitle(params: {
  goalTitle: string
  category: string
  userContextText: string
  avoidTitles: string[]
}): Promise<string> {
  const avoid = params.avoidTitles.filter(Boolean).slice(0, 24)
  const prompt =
    'Generate ONE specific and actionable daily mission for someone working on the goal: ' +
    `'${params.goalTitle}' in category '${params.category}'.\n\n` +
    `Context about this person: ${params.userContextText || 'n/a'}\n\n` +
    'The mission must be:\n' +
    '- Completable in a single day\n' +
    `- Different from these existing missions: ${avoid.join(' | ') || 'n/a'}\n` +
    '- Specific enough that the user knows exactly what to do\n\n' +
    'Return ONLY a JSON object: {"mission":"mission title here"}\n' +
    'Use double quotes. No markdown.'

  const parsed = await openRouterJson(prompt)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Mission generation response is not a JSON object')
  }
  const mission = (parsed as Record<string, unknown>).mission
  if (typeof mission !== 'string' || !mission.trim()) {
    throw new Error('Mission generation response missing "mission" string')
  }
  return mission.trim()
}

export async function generateOneWeeklyQuestTitle(params: {
  goalTitle: string
  category: string
  weekNumber: number
  totalWeeks: number
  avoidTitles: string[]
}): Promise<string> {
  const avoid = params.avoidTitles.filter(Boolean).slice(0, 32)
  const n = params.weekNumber
  const prompt =
    'Generate ONE specific weekly milestone for someone working on the goal: ' +
    `'${params.goalTitle}' in category '${params.category}'. This is for week ${n} of ${params.totalWeeks}.\n\n` +
    'The milestone must:\n' +
    '- Represent meaningful progress after one week of work\n' +
    `- Be different from these existing quests: ${avoid.join(' | ') || 'n/a'}\n` +
    `- Start with 'Week ${n}:'\n\n` +
    `Return ONLY: {"quest":"Week ${n}: quest title here"}`

  const parsed = await openRouterJson(prompt)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Quest generation response is not a JSON object')
  }
  const quest = (parsed as Record<string, unknown>).quest
  if (typeof quest !== 'string' || !quest.trim()) {
    throw new Error('Quest generation response missing "quest" string')
  }
  return quest.trim()
}

async function openRouterPlainSentence(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Missing VITE_OPENROUTER_API_KEY in environment')
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'InHabit App',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const errBody =
      data && typeof data === 'object' && 'error' in data
        ? JSON.stringify((data as { error: unknown }).error)
        : JSON.stringify(data)
    throw new Error(`OpenRouter returned ${res.status} — ${errBody}`)
  }

  const choices =
    data && typeof data === 'object' && 'choices' in data
      ? (data as { choices: unknown }).choices
      : undefined
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('OpenRouter returned no choices')
  }

  const first = choices[0] as { message?: { content?: string } }
  const content = first?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter returned empty message content')
  }

  return content
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function openRouterChat(
  messages: { role: 'system' | 'user'; content: string }[],
): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Missing VITE_OPENROUTER_API_KEY in environment')
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'InHabit App',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
    }),
  })

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const errBody =
      data && typeof data === 'object' && 'error' in data
        ? JSON.stringify((data as { error: unknown }).error)
        : JSON.stringify(data)
    throw new Error(`OpenRouter returned ${res.status} — ${errBody}`)
  }

  const choices =
    data && typeof data === 'object' && 'choices' in data
      ? (data as { choices: unknown }).choices
      : undefined
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('OpenRouter returned no choices')
  }

  const first = choices[0] as { message?: { content?: string } }
  const content = first?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter returned empty message content')
  }

  return content
    .trim()
    .replace(/\s+/g, ' ')
    .trim()
}

export async function weeklyReflectionCoachInsight(
  stats: {
    completedMissions: number
    totalMissions: number
    completionRate: number
    streak: number
    weeklyXp: number
    habitsCompleted: number
  },
  answers: {
    win: string
    miss: string
    improve: string
  },
  userContext?: {
    goalCategories: string[]
    goalContext: Record<string, any>
    displayName: string
  },
  wellness?: {
    avgMoodThisWeek: number | null
    avgEnergyThisWeek: number | null
    avgRestThisWeek: number | null
  },
): Promise<string> {
  const system =
    'You are a direct, no-BS discipline coach for young men. Give sharp, specific feedback based on their week. Never be generic. Never say "great job" or "keep it up". Reference their actual answers. Be direct and occasionally challenging. Maximum 2 sentences.'

  const naturalJoin = (xs: string[]): string => {
    const parts = xs.map((s) => s.trim()).filter(Boolean)
    if (parts.length === 0) return ''
    if (parts.length === 1) return parts[0]
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
    return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
  }

  const name = userContext?.displayName?.trim() || 'him'
  const cats = userContext?.goalCategories?.filter(Boolean) ?? []
  const catLine = cats.length
    ? `Coaching a young man named ${name} who is focused on: ${naturalJoin(cats)}.`
    : `Coaching a young man named ${name}.`

  const answersText = {
    win: answers.win.trim(),
    miss: answers.miss.trim(),
    improve: answers.improve.trim(),
  }

  const wantContext =
    userContext?.goalContext &&
    typeof userContext.goalContext === 'object' &&
    !Array.isArray(userContext.goalContext)

  const lcAll = `${answersText.win}\n${answersText.miss}\n${answersText.improve}`.toLowerCase()
  const ctxLines: string[] = []
  if (wantContext) {
    const ctx = userContext!.goalContext as Record<string, any>
    for (const k of Object.keys(ctx)) {
      const v = ctx[k]
      if (v == null) continue
      const keyWords = k
        .toLowerCase()
        .split(/[_\s]+/)
        .filter((w) => w.length >= 4)
      if (keyWords.length > 0 && !keyWords.some((w) => lcAll.includes(w))) {
        continue
      }
      let snippet = ''
      if (typeof v === 'string') snippet = v
      else {
        try {
          snippet = JSON.stringify(v)
        } catch {
          snippet = ''
        }
      }
      snippet = snippet.replace(/\s+/g, ' ').trim()
      if (!snippet) continue
      ctxLines.push(`${k}: ${snippet}`)
      if (ctxLines.length >= 2) break
    }
  }

  let wellnessBlock = ''
  if (wellness) {
    const moodLine =
      wellness.avgMoodThisWeek != null
        ? `Average mood this week: ${wellness.avgMoodThisWeek}/5`
        : 'Average mood this week: no mood logs'
    const energyLine =
      wellness.avgEnergyThisWeek != null
        ? `Average energy this week: ${wellness.avgEnergyThisWeek}/5`
        : 'Average energy this week: no energy logs this week'
    const restLine =
      wellness.avgRestThisWeek != null
        ? `Average sleep quality: ${wellness.avgRestThisWeek}/5`
        : 'Average sleep quality: no sleep logs this week'
    wellnessBlock = `${moodLine}\n${energyLine}\n${restLine}\n\n`
  }

  const user =
    `${catLine}\n\n` +
    'Their week:\n' +
    `- Completed ${stats.completedMissions} of ${stats.totalMissions} missions (${stats.completionRate}% rate)\n` +
    `- ${stats.streak} day streak\n` +
    `- ${stats.weeklyXp} XP earned\n` +
    `- ${stats.habitsCompleted} habits completed\n\n` +
    wellnessBlock +
    'Their reflection:\n' +
    `Win: ${answersText.win}\n` +
    `Failed at / avoided: ${answersText.miss}\n` +
    `Will change: ${answersText.improve}\n\n` +
    (ctxLines.length ? `Context: ${ctxLines.join(' / ')}\n\n` : '') +
    'Give a direct, specific, challenging 2-sentence insight. Reference their name once. Never be generic.' +
    (wellness
      ? ' If wellness averages are provided above, you may tie them to discipline and performance.'
      : '')

  return openRouterChat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])
}

/** One-sentence “why this quest” for UI (Claude Haiku via OpenRouter). */
export async function explainWeeklyQuestWhy(params: {
  questTitle: string
  goalTitle: string
}): Promise<string> {
  const qt = params.questTitle.replace(/'/g, "'")
  const gt = params.goalTitle.replace(/'/g, "'")
  const prompt =
    `In one sentence, explain why '${qt}' is an important milestone for someone working toward '${gt}'. ` +
    'Be specific and motivating. Max 20 words. Reply with only that sentence, no quotation marks.'

  return openRouterPlainSentence(prompt)
}

