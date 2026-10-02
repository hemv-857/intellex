// FTS5 match-string construction. User text goes straight into a MATCH expression,
// which is a query language (quotes, NEAR, *, -, operators) — so nothing from the
// user is ever pasted in. Tokens are extracted and re-quoted individually, which
// is both injection-safe and predictable: "Series A" becomes `"series" OR "a"`.

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'how', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'their', 'them', 'there', 'these', 'this', 'to', 'was', 'were',
  'what', 'when', 'where', 'which', 'who', 'will', 'with', 'list', 'find', 'show', 'data', 'record',
  'records', 'please', 'me', 'all', 'any', 'about',
])

const MAX_TERMS = 24
const MAX_TERM_LENGTH = 40

/**
 * Builds an FTS5 MATCH expression that ORs the meaningful tokens of `terms`.
 * Returns null when nothing searchable remains.
 */
export function buildMatchExpression(terms: string[]): string | null {
  const seen = new Set<string>()
  const quoted: string[] = []

  for (const raw of terms) {
    // Keep only word characters; everything else (including FTS operators) is
    // dropped rather than escaped-and-hoped-for.
    const tokens = String(raw ?? '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((t) => t.slice(0, MAX_TERM_LENGTH))
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t))

    for (const t of tokens) {
      if (seen.has(t)) continue
      seen.add(t)
      quoted.push(`"${t}"`)
      if (seen.size >= MAX_TERMS) break
    }
    if (seen.size >= MAX_TERMS) break
  }

  return quoted.length ? quoted.join(' OR ') : null
}

/** True when the expression is worth running (guards against empty/overbroad MATCH). */
export function isUsableExpression(expr: string | null): expr is string {
  return !!expr && expr.length > 0
}