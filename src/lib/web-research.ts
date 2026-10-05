// Web search and page reading via Tavily.
//
// One provider covers both capabilities the collection engine needs, and both
// are deterministic POSTs returning data we shape — unlike OpenRouter's
// web_search/web_fetch, which are tools the *model* chooses to call and so
// cannot guarantee a fixed number of results. That determinism is load-bearing:
// ranking, recency and dedupe all depend on it.
//
// Swap point for a different search/extract provider is this file only. The
// shapes below are the contract the rest of the engine codes against.

import { isFetchableUrl } from '@/lib/url-guard'

const TAVILY_URL = 'https://api.tavily.com'

const SEARCH_TIMEOUT_MS = 30_000
const EXTRACT_TIMEOUT_MS = 45_000

// Tavily bills credits, not tokens, and reports them only when asked.
const INCLUDE_USAGE = true

export interface SearchResultItem {
  url: string
  name: string
  snippet: string
  host_name: string
  rank: number
  date: string
  favicon: string
}

export interface PageRead {
  url: string
  /** Cleaned page body as markdown. Not HTML — the extractor is an LLM. */
  content: string
}

function requireKey(): string {
  const key = process.env.TAVILY_API_KEY
  if (!key) {
    throw new Error('TAVILY_API_KEY is not set — web search is unavailable')
  }
  return key
}

async function post<T>(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const res = await fetch(`${TAVILY_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ include_usage: INCLUDE_USAGE, ...body }),
  })

  const raw = await res.text()
  if (!res.ok) {
    let detail = ''
    try {
      const parsed = JSON.parse(raw) as { detail?: { error?: string } | string; error?: string }
      const d = parsed.detail
      detail = (typeof d === 'string' ? d : d?.error) || parsed.error || ''
    } catch {
      detail = raw.slice(0, 300)
    }
    throw new Error(`Tavily ${path} ${res.status}: ${detail || 'request failed'}`)
  }

  return JSON.parse(raw) as T
}

/**
 * Tavily takes a closed set of recency buckets, not a day count. Clamping to
 * the nearest bucket is honest: it biases toward recent sources without
 * discarding results whose publish date is undetectable.
 */
function timeRangeFor(recencyDays?: number): 'day' | 'week' | 'month' | 'year' | null {
  if (!recencyDays || recencyDays <= 0) return null
  if (recencyDays <= 1) return 'day'
  if (recencyDays <= 7) return 'week'
  if (recencyDays <= 31) return 'month'
  return 'year'
}

interface TavilySearchResponse {
  results?: {
    title?: string
    url?: string
    content?: string
    score?: number
    published_date?: string | null
    favicon?: string
  }[]
}

export async function searchWeb(
  query: string,
  opts: { num: number; recencyDays?: number } = { num: 5 },
): Promise<SearchResultItem[]> {
  const time_range = timeRangeFor(opts.recencyDays)

  const body = await post<TavilySearchResponse>(
    '/search',
    {
      query,
      // `basic` is 1 credit per search; `advanced` is 2 and buys relevance we
      // do not need for discovery — extraction does the precise reading.
      search_depth: 'basic',
      max_results: Math.min(Math.max(opts.num, 1), 20),
      // `general` rather than `news`: the planner explicitly asks for company
      // and official sources, which the news topic would filter out.
      topic: 'general',
      ...(time_range ? { time_range } : {}),
      include_published_date: true,
      // Leave false: with true, Tavily also drops every result that has no
      // detectable date, which would silently gut corporate/undated sources.
      filter_by_published_date: false,
      include_favicon: true,
      include_answer: false,
      include_raw_content: false,
    },
    SEARCH_TIMEOUT_MS,
  )

  const out: SearchResultItem[] = []
  for (const r of body.results ?? []) {
    if (!r?.url) continue
    let host = ''
    try {
      host = new URL(r.url).hostname
    } catch {
      continue
    }
    out.push({
      url: r.url,
      name: r.title || r.url,
      snippet: r.content || '',
      host_name: host,
      // The caller renumbers ranks as it dedupes, so this is position-only.
      rank: out.length,
      date: r.published_date || '',
      favicon: r.favicon || '',
    })
  }
  return out
}

interface TavilyExtractResponse {
  results?: { url?: string; raw_content?: string }[]
  failed_results?: { url?: string; error?: string }[]
}

/**
 * Returns null when the page could not be read. Tavily answers HTTP 200 even
 * when every URL in the batch failed, so a 200 alone proves nothing — callers
 * depend on null to mark a source as failed rather than silently record an
 * empty read.
 */
export async function readPage(url: string): Promise<PageRead | null> {
  // We are not the one making the request, but we are still asking a third
  // party to probe an address. Keep the same policy gate the collector applies.
  if (!isFetchableUrl(url)) return null

  const body = await post<TavilyExtractResponse>(
    '/extract',
    {
      urls: [url],
      // basic = 1 credit per 5 successful extractions.
      extract_depth: 'basic',
      format: 'markdown',
    },
    EXTRACT_TIMEOUT_MS,
  )

  const hit = (body.results ?? []).find((r) => r?.url === url) ?? body.results?.[0]
  const content = hit?.raw_content?.trim()
  if (!content) {
    const why = body.failed_results?.find((f) => f?.url === url)?.error
    if (why) throw new Error(why)
    return null
  }

  return { url: hit?.url || url, content }
}
