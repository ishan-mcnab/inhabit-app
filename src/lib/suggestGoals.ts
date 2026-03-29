import {
  cleanModelJsonContent,
  extractTopLevelJsonArray,
  tryParseJsonFromCleaned,
} from './parseModelJson'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-3-haiku'

export type SuggestedGoal = {
  title: string
  category: string
  description: string
  suggestedDuration: string
}

const SYSTEM_PROMPT =
  'You are a goal-setting coach helping young men identify ' +
  'meaningful and achievable goals based on their personal ' +
  'situation and focus areas. Suggest goals that are specific, ' +
  'motivating, and realistic. Never suggest vague goals like ' +
  "'get healthier' — suggest specific goals like 'Read 12 books " +
  "this year' or 'Save $2,000 in 6 months'.\n\n" +
  'IMPORTANT: You must NEVER use fitness_consistency as a category. ' +
  'That category does not exist for goals. Only use these exact ' +
  'category slugs: health_habits, skills_growth, building_confidence, ' +
  'mental_emotional_health, financial_goals\n\n' +
  'You MUST use double quotes for all JSON strings, never single ' +
  'quotes. Your entire response must be valid JSON that can be ' +
  'parsed by JSON.parse() without any modifications.'

const ALLOWED_GOAL_CATEGORIES = new Set([
  'health_habits',
  'skills_growth',
  'building_confidence',
  'mental_emotional_health',
  'financial_goals',
])

/** Invalid goal slugs — always remap the suggestion to health_habits. */
const INVALID_SLUGS_REMAP_TO_HEALTH = new Set([
  'fitness_consistency',
  'physical_fitness',
])

const FITNESS_HEALTH_KEYWORDS = [
  'gym',
  'workout',
  'work out',
  'training',
  'train ',
  'fitness',
  'protein',
  'lift',
  'lifting',
  'cardio',
  'muscle',
  'strength training',
  'exercise',
  'bodybuilding',
  'athletic',
  'marathon',
  '5k',
  '10k',
  'deadlift',
  'squat',
  'bench press',
  'bulk',
  'cutting',
  'lean mass',
  'physique',
  'running',
  'jogging',
  'hypertrophy',
  'ppl',
  '5/3/1',
  'calorie',
  'macros',
  'nutrition',
  'meal prep',
  'hydration',
  'steps per day',
  'sleep schedule',
] as const

function summarizeGoalContext(goalContext: Record<string, unknown>): string {
  if (!goalContext || typeof goalContext !== 'object') return '(none)'
  const parts: string[] = []
  for (const [cat, raw] of Object.entries(goalContext)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const o = raw as Record<string, unknown>
    const lines = Object.entries(o)
      .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
      .map(([k, v]) => `  - ${k.replace(/_/g, ' ')}: ${v}`)
    if (lines.length > 0) {
      parts.push(`${cat}:\n${lines.join('\n')}`)
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : '(none)'
}

function buildUserPrompt(
  goalCategories: string[],
  goalContext: Record<string, any>,
): string {
  const areas =
    goalCategories.length > 0 ? goalCategories.join(', ') : '(none selected)'
  const ctx =
    goalContext && typeof goalContext === 'object' && !Array.isArray(goalContext)
      ? (goalContext as Record<string, unknown>)
      : {}
  const summary = summarizeGoalContext(ctx)

  return (
    'Suggest 5 specific and personalized goals for someone with ' +
    `these focus areas: ${areas}.\n\n` +
    'Here is what we know about them:\n' +
    `${summary}\n\n` +
    'Return ONLY a valid JSON array with no extra text, no markdown, no backticks:\n' +
    '[\n' +
    '  {\n' +
    '    "title": "Specific goal title",\n' +
    '    "category": "category_slug",\n' +
    '    "description": "One sentence explaining why this goal suits them specifically",\n' +
    '    "suggestedDuration": "3 months"\n' +
    '  }\n' +
    ']\n\n' +
    'Make each suggestion feel personally tailored to their ' +
    'specific answers, not generic. The category must be exactly one of: ' +
    'health_habits, skills_growth, building_confidence, ' +
    'mental_emotional_health, financial_goals. ' +
    'Never use fitness_consistency or any other slug.'
  )
}

function buildTopUpUserPrompt(
  goalCategories: string[],
  goalContext: Record<string, any>,
  needCount: number,
  existingTitles: string[],
): string {
  const areas =
    goalCategories.length > 0 ? goalCategories.join(', ') : '(none selected)'
  const ctx =
    goalContext && typeof goalContext === 'object' && !Array.isArray(goalContext)
      ? (goalContext as Record<string, unknown>)
      : {}
  const summary = summarizeGoalContext(ctx)
  const avoid =
    existingTitles.length > 0
      ? `\n\nDo NOT repeat or closely paraphrase these existing titles:\n${existingTitles.map((t) => `- ${t}`).join('\n')}`
      : ''

  return (
    `Suggest exactly ${needCount} additional specific and personalized goals for someone with ` +
    `these focus areas: ${areas}.\n\n` +
    'Here is what we know about them:\n' +
    `${summary}\n\n` +
    `Return ONLY a valid JSON array of exactly ${needCount} object(s) with no extra text, no markdown, no backticks:\n` +
    '[\n' +
    '  {\n' +
    '    "title": "Specific goal title",\n' +
    '    "category": "category_slug",\n' +
    '    "description": "One sentence explaining why this goal suits them specifically",\n' +
    '    "suggestedDuration": "3 months"\n' +
    '  }\n' +
    ']\n\n' +
    'Category must be exactly one of: health_habits, skills_growth, building_confidence, ' +
    'mental_emotional_health, financial_goals. Never fitness_consistency or physical_fitness.' +
    avoid
  )
}

function pickStr(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return ''
}

function normalizeCategorySlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_')
}

function isFitnessOrHealthRelatedBlob(title: string, description: string): boolean {
  const blob = `${title} ${description}`.toLowerCase()
  return FITNESS_HEALTH_KEYWORDS.some((kw) => blob.includes(kw.toLowerCase()))
}

/**
 * Allowed slug → keep. fitness_consistency / physical_fitness → health_habits.
 * Other invalid → health_habits if text looks fitness/health, else drop (null).
 */
function postProcessSuggestion(
  title: string,
  category: string,
  description: string,
  suggestedDuration: string,
): SuggestedGoal | null {
  if (!title || !description || !suggestedDuration) return null

  const norm = normalizeCategorySlug(category)

  if (ALLOWED_GOAL_CATEGORIES.has(norm)) {
    return { title, category: norm, description, suggestedDuration }
  }

  if (INVALID_SLUGS_REMAP_TO_HEALTH.has(norm)) {
    return {
      title,
      category: 'health_habits',
      description,
      suggestedDuration,
    }
  }

  if (isFitnessOrHealthRelatedBlob(title, description)) {
    return {
      title,
      category: 'health_habits',
      description,
      suggestedDuration,
    }
  }

  return null
}

function parseArrayItems(parsed: unknown): Record<string, unknown>[] {
  if (!Array.isArray(parsed)) {
    throw new Error(
      `suggestGoals: expected a JSON array, got ${parsed === null ? 'null' : typeof parsed}`,
    )
  }
  if (parsed.length === 0) {
    throw new Error('suggestGoals: model returned an empty array')
  }
  const items: Record<string, unknown>[] = []
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i]
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`suggestGoals: item ${i + 1} is not an object`)
    }
    items.push(item as Record<string, unknown>)
  }
  return items
}

function rawItemsToProcessed(items: Record<string, unknown>[]): SuggestedGoal[] {
  const out: SuggestedGoal[] = []
  const seenTitles = new Set<string>()
  for (const r of items) {
    const title = pickStr(r, 'title')
    const category = pickStr(r, 'category')
    const description = pickStr(r, 'description')
    const suggestedDuration = pickStr(
      r,
      'suggestedDuration',
      'suggested_duration',
    )
    const processed = postProcessSuggestion(
      title,
      category,
      description,
      suggestedDuration,
    )
    if (!processed) continue
    const key = processed.title.toLowerCase().trim()
    if (seenTitles.has(key)) continue
    seenTitles.add(key)
    out.push(processed)
  }
  return out
}

function parseSuggestedGoalsContent(raw: string): SuggestedGoal[] {
  const cleaned = cleanModelJsonContent(raw)
  let parsed: unknown | null = tryParseJsonFromCleaned(cleaned)
  if (parsed === null) {
    const slice = extractTopLevelJsonArray(cleaned)
    if (slice) parsed = tryParseJsonFromCleaned(slice)
  }
  if (parsed === null) {
    throw new Error(
      'suggestGoals: could not parse JSON from model (direct, quote-fix, or array slice)',
    )
  }
  const items = parseArrayItems(parsed)
  return rawItemsToProcessed(items)
}

type OpenRouterMessage = { role: string; content: string }
type OpenRouterChoice = { message?: OpenRouterMessage }

async function fetchSuggestionsFromModel(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`suggestGoals: network request failed — ${msg}`)
  }

  let data: unknown
  try {
    data = await res.json()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`suggestGoals: failed to read response JSON — ${msg}`)
  }

  if (!res.ok) {
    const errBody =
      data && typeof data === 'object' && 'error' in data
        ? JSON.stringify((data as { error: unknown }).error)
        : JSON.stringify(data)
    throw new Error(
      `suggestGoals: OpenRouter returned ${res.status} — ${errBody}`,
    )
  }

  const choices =
    data && typeof data === 'object' && 'choices' in data
      ? (data as { choices: unknown }).choices
      : undefined
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('suggestGoals: no choices in API response')
  }

  const first = choices[0] as OpenRouterChoice
  const content = first?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(
      'suggestGoals: missing data.choices[0].message.content string',
    )
  }
  return content
}

const TARGET_COUNT = 5
const MAX_TOP_UP_ROUNDS = 4

/**
 * OpenRouter (Claude 3 Haiku) — 5 personalized goal suggestions from onboarding context.
 */
export async function suggestGoals(
  goalCategories: string[],
  goalContext: Record<string, any>,
): Promise<SuggestedGoal[]> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error(
      'suggestGoals: missing VITE_OPENROUTER_API_KEY in environment',
    )
  }

  const userPrompt = buildUserPrompt(goalCategories, goalContext)
  const content = await fetchSuggestionsFromModel(
    apiKey,
    SYSTEM_PROMPT,
    userPrompt,
  )

  let accumulated = parseSuggestedGoalsContent(content)

  let rounds = 0
  while (accumulated.length < TARGET_COUNT && rounds < MAX_TOP_UP_ROUNDS) {
    rounds++
    const need = TARGET_COUNT - accumulated.length
    const existingTitles = accumulated.map((g) => g.title)
    const topUpPrompt = buildTopUpUserPrompt(
      goalCategories,
      goalContext,
      need,
      existingTitles,
    )
    const moreContent = await fetchSuggestionsFromModel(
      apiKey,
      SYSTEM_PROMPT,
      topUpPrompt,
    )
    let moreParsed: SuggestedGoal[]
    try {
      moreParsed = parseSuggestedGoalsContent(moreContent)
    } catch {
      moreParsed = []
    }
    const seen = new Set(accumulated.map((g) => g.title.toLowerCase().trim()))
    for (const g of moreParsed) {
      const k = g.title.toLowerCase().trim()
      if (seen.has(k)) continue
      seen.add(k)
      accumulated.push(g)
      if (accumulated.length >= TARGET_COUNT) break
    }
  }

  if (accumulated.length < TARGET_COUNT) {
    throw new Error(
      `suggestGoals: only obtained ${accumulated.length} valid suggestions after top-up; need ${TARGET_COUNT}`,
    )
  }

  return accumulated.slice(0, TARGET_COUNT)
}
