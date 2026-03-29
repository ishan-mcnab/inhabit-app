/**
 * Shared helpers for parsing LLM "JSON" responses (fences, single quotes).
 */

export function cleanModelJsonContent(raw: string): string {
  let t = raw.trim()
  if (t.startsWith('```')) {
    t = t
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
  }
  if (/^json\s/i.test(t)) {
    t = t.replace(/^json\s+/i, '').trim()
  }
  return t.trim()
}

/** Try strict parse, then naive single-quote → double-quote parse. */
export function tryParseJsonFromCleaned(cleaned: string): unknown | null {
  try {
    return JSON.parse(cleaned) as unknown
  } catch {
    /* continue */
  }
  try {
    return JSON.parse(cleaned.replace(/'/g, '"')) as unknown
  } catch {
    return null
  }
}

/**
 * Find the first top-level `[` … `]` span (respects quoted strings).
 */
export function extractTopLevelJsonArray(text: string): string | null {
  const start = text.indexOf('[')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let q = '"'
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (c === '\\' && i + 1 < text.length) {
        i++
        continue
      }
      if (c === q) inStr = false
      continue
    }
    if (c === '"' || c === "'") {
      inStr = true
      q = c
      continue
    }
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}
