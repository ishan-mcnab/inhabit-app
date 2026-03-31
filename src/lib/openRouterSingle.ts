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

