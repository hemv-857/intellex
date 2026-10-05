// Chat completions via OpenRouter.
//
// Native fetch rather than a vendor SDK: this is one POST with an OpenAI-shaped
// request and response, so a dependency would buy nothing. The swap point for a
// different chat provider is this file and nothing else.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Default is a `:free` route so the app runs without a paid OpenRouter plan.
// Verified on 2026-10-02; free slugs rotate, so this is overridable per
// deployment via OPENROUTER_MODEL.
const DEFAULT_MODEL = 'inclusionai/ling-3.0-flash-sante:free'

const REQUEST_TIMEOUT_MS = 60_000

// Ceiling for one completion. Extraction sends up to 6k chars of page content,
// so a small cap would truncate mid-record and return invalid JSON.
const MAX_TOKENS = 8_000

export interface ChatMessage {
  role: 'system' | 'assistant' | 'user'
  content: string
}

export interface ChatResult {
  text: string
  /** Real per-call usage for OUR completions — the only figure we report. */
  tokens: number
}

function requireKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    throw new Error('OPENROUTER_API_KEY is not set — chat is unavailable')
  }
  return key
}

// Most models return `content` as a string, but the OpenAI schema also permits
// an array of content parts. Normalising here keeps callers on a plain string.
function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      const p = part as { type?: string; text?: string }
      return p?.type === 'text' && typeof p.text === 'string' ? p.text : ''
    })
    .join('')
}

export function chatModel(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL
}

export async function chat(messages: ChatMessage[]): Promise<ChatResult> {
  const key = requireKey()

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: chatModel(),
      messages,
      temperature: 0,
      max_tokens: MAX_TOKENS,
      // Reasoning models otherwise spend the token budget on deliberation and
      // can return content: null with finish_reason "length", which reaches
      // safeJsonParse as an empty string and silently degrades to the fallback
      // plan. Confirmed on the default free route: 80 of 83 completion tokens
      // were reasoning, leaving no JSON.
      reasoning: { enabled: false },
    }),
  })

  const raw = await res.text()
  if (!res.ok) {
    // Surface the provider's own message; a bare status code is not debuggable.
    let detail = ''
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string }
      detail = parsed.error?.message || parsed.message || ''
    } catch {
      detail = raw.slice(0, 300)
    }
    throw new Error(`OpenRouter ${res.status}: ${detail || 'request failed'}`)
  }

  const body = JSON.parse(raw) as {
    choices?: { message?: { content?: unknown }; finish_reason?: string }[]
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
  }

  const choice = body.choices?.[0]
  const text = contentToText(choice?.message?.content)
  const usage = body.usage
  const tokens =
    usage?.total_tokens ?? (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0)

  // An empty completion is a failure, not an empty answer. Failing loudly here
  // stops it from reaching safeJsonParse, whose fallback would quietly produce
  // a generic 4-field plan or an empty record set that looks like a real result.
  if (!text.trim()) {
    throw new Error(
      `OpenRouter returned no content (finish_reason: ${choice?.finish_reason ?? 'unknown'})`,
    )
  }

  return { text, tokens }
}
