/** Structured missions from OpenRouter (Claude Haiku). */
export type GeneratedMissions = {
  weekly_quests: [string, string, string, string]
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
  "You are a direct, no-excuse discipline coach for young men who are " +
  'serious about self improvement. You generate specific, actionable, ' +
  'and challenging tasks. Never be vague or generic. Every task should ' +
  'be something the user can actually do today with no ambiguity about ' +
  "what it means. Avoid filler words like 'consider' or 'try to'. " +
  'Be direct and commanding.'

function buildUserPrompt(
  goalTitle: string,
  category: string,
  targetDate: string,
): string {
  return (
    'Generate a structured plan for someone working on the goal: ' +
    `'${goalTitle}' in the category '${category}'. Their target completion ` +
    `date is ${targetDate}.\n\n` +
    'Return ONLY a valid JSON object with no extra text, no markdown, ' +
    'no backticks, in exactly this format:\n' +
    '{\n' +
    "  'weekly_quests': [\n" +
    "    'Week 1 milestone title',\n" +
    "    'Week 2 milestone title', \n" +
    "    'Week 3 milestone title',\n" +
    "    'Week 4 milestone title'\n" +
    '  ],\n' +
    "  'daily_missions': [\n" +
    "    'Specific daily task 1',\n" +
    "    'Specific daily task 2',\n" +
    "    'Specific daily task 3',\n" +
    "    'Specific daily task 4',\n" +
    "    'Specific daily task 5',\n" +
    "    'Specific daily task 6',\n" +
    "    'Specific daily task 7'\n" +
    '  ]\n' +
    '}\n\n' +
    'Weekly quests should be meaningful weekly milestones that build ' +
    'toward the goal. Daily missions should be specific, actionable ' +
    'tasks the user can complete in a single day. Both should be ' +
    'tailored specifically to the goal title and category provided.'
  )
}

/**
 * Strip markdown fences and trim so JSON.parse can run on model output.
 */
function cleanModelJsonContent(raw: string): string {
  let t = raw.trim()
  if (t.startsWith('```')) {
    t = t
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
  }
  // Leading "json" line some models emit
  if (/^json\s/i.test(t)) {
    t = t.replace(/^json\s+/i, '').trim()
  }
  return t.trim()
}

type OpenRouterMessage = { role: string; content: string }
type OpenRouterChoice = { message?: OpenRouterMessage }

function isStringArray(a: unknown): a is string[] {
  return Array.isArray(a) && a.every((x) => typeof x === 'string')
}

function assertGeneratedMissions(parsed: unknown): GeneratedMissions {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('generateMissions: response is not a JSON object')
  }
  const o = parsed as Record<string, unknown>
  const weekly = o.weekly_quests
  const daily = o.daily_missions
  if (!isStringArray(weekly) || weekly.length !== 4) {
    throw new Error(
      `generateMissions: expected weekly_quests to be an array of exactly 4 strings, got ${weekly === undefined ? 'undefined' : Array.isArray(weekly) ? `length ${weekly.length}` : typeof weekly}`,
    )
  }
  if (!isStringArray(daily) || daily.length !== 7) {
    throw new Error(
      `generateMissions: expected daily_missions to be an array of exactly 7 strings, got ${daily === undefined ? 'undefined' : Array.isArray(daily) ? `length ${daily.length}` : typeof daily}`,
    )
  }
  return {
    weekly_quests: weekly as GeneratedMissions['weekly_quests'],
    daily_missions: daily as GeneratedMissions['daily_missions'],
  }
}

/**
 * Calls OpenRouter (Claude 3 Haiku) to produce 4 weekly quest titles
 * and 7 daily mission titles for the given goal.
 */
export async function generateMissions(
  goalTitle: string,
  category: string,
  targetDate: string,
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

  const userPrompt = buildUserPrompt(goalTitle, category, targetDate)

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

  const cleaned = cleanModelJsonContent(content)
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned) as unknown
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `generateMissions: JSON.parse failed after cleaning — ${msg}. Snippet: ${cleaned.slice(0, 200)}`,
    )
  }

  return assertGeneratedMissions(parsed)
}

