// Provider clients, tested against mocked fetch. No network, no API keys.
//
// These cover the mapping logic that is easy to get subtly wrong and hard to
// notice: provider field names, the recency-bucket mapping, and — most
// importantly — that a Tavily 200 with an empty result set is a FAILURE.

import { describe, expect, it, afterEach } from 'bun:test'
import { chat, chatModel } from '../src/lib/llm'
import { readPage, searchWeb } from '../src/lib/web-research'

const realFetch = globalThis.fetch
const realKey = process.env.OPENROUTER_API_KEY
const realTavily = process.env.TAVILY_API_KEY

afterEach(() => {
  globalThis.fetch = realFetch
  process.env.OPENROUTER_API_KEY = realKey
  process.env.TAVILY_API_KEY = realTavily
  delete process.env.OPENROUTER_MODEL
})

interface Call { url: string; init: RequestInit }

function mockFetch(responses: { status?: number; body: unknown }[]): Call[] {
  const calls: Call[] = []
  let i = 0
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    const r = responses[Math.min(i++, responses.length - 1)]
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return calls
}

describe('llm: chat', () => {
  it('throws a named error when the key is missing', async () => {
    delete process.env.OPENROUTER_API_KEY
    expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/OPENROUTER_API_KEY is not set/)
  })

  it('disables reasoning so the token budget is not spent on deliberation', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test'
    const calls = mockFetch([{ body: { choices: [{ message: { content: '{}' } }] } }])
    await chat([{ role: 'user', content: 'hi' }])
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.reasoning).toEqual({ enabled: false })
    expect(body.max_tokens).toBeGreaterThanOrEqual(8000)
  })

  // Confirmed live on the default free route: 80 of 83 completion tokens were
  // reasoning, leaving content: null and an empty plan after safeJsonParse.
  it('throws rather than returning empty text that would become a fallback plan', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test'
    mockFetch([
      {
        body: {
          choices: [{ message: { content: null }, finish_reason: 'length' }],
          usage: { total_tokens: 50 },
        },
      },
    ])
    expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/no content.*length/i)
  })

  it('returns text and real usage from an OpenAI-shaped body', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test'
    mockFetch([
      {
        body: {
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { total_tokens: 42 },
        },
      },
    ])

    const res = await chat([{ role: 'user', content: 'hi' }])
    expect(res.text).toBe('{"ok":true}')
    expect(res.tokens).toBe(42)
  })

  it('sums prompt+completion when total_tokens is absent', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test'
    mockFetch([
      { body: { choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } } },
    ])
    expect((await chat([{ role: 'user', content: 'hi' }])).tokens).toBe(10)
  })

  // Some OpenAI-compatible models return content parts instead of a string.
  it('joins array content parts into text', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test'
    mockFetch([
      { body: { choices: [{ message: { content: [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }] } }] } },
    ])
    expect((await chat([{ role: 'user', content: 'hi' }])).text).toBe('{"a":1}')
  })

  it('surfaces the provider error message instead of a bare status', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test'
    mockFetch([{ status: 401, body: { error: { message: 'No auth credentials found' } } }])
    expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/No auth credentials found/)
  })

  it('defaults to a free route so no paid plan is required', () => {
    expect(chatModel()).toMatch(/:free$/)
  })

  it('honours an override', () => {
    process.env.OPENROUTER_MODEL = 'google/gemini-2.5-flash'
    expect(chatModel()).toBe('google/gemini-2.5-flash')
  })

  it('sends the key as a bearer token', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-secret'
    const calls = mockFetch([{ body: { choices: [{ message: { content: 'x' } }] } }])
    await chat([{ role: 'user', content: 'hi' }])
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-or-secret')
  })
})

describe('web-research: searchWeb', () => {
  const ok = {
    query: 'q',
    results: [
      { title: 'A', url: 'https://news.example.com/a', content: 'snip a', published_date: '2026-01-02', favicon: 'f1' },
      { title: 'B', url: 'https://other.example.org/b', content: 'snip b', published_date: null },
    ],
  }

  it('maps Tavily fields onto the engine contract', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    mockFetch([{ body: ok }])
    const { results: res } = await searchWeb('q', { num: 4 })

    expect(res).toHaveLength(2)
    expect(res[0]).toEqual({
      url: 'https://news.example.com/a',
      name: 'A',
      snippet: 'snip a',
      host_name: 'news.example.com',
      rank: 0,
      date: '2026-01-02',
      favicon: 'f1',
    })
    // A null published_date must become an empty string, not the string "null".
    expect(res[1].date).toBe('')
    expect(res[1].rank).toBe(1)
  })

  // Tavily takes closed recency buckets. Passing a raw day count 400s.
  it.each([
    [0, undefined],
    [1, 'day'],
    [7, 'week'],
    [31, 'month'],
    [365, 'year'],
  ])('maps recencyDays=%i to the %s bucket', async (days, expected) => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    const calls = mockFetch([{ body: ok }])
    await searchWeb('q', { num: 3, recencyDays: days || undefined })
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.time_range).toBe(expected)
  })

  it('omits the recency filter entirely when not requested', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    const calls = mockFetch([{ body: ok }])
    await searchWeb('q', { num: 3 })
    expect(JSON.parse(String(calls[0].init.body)).time_range).toBeUndefined()
  })

  it('clamps max_results into the 1-20 range the API accepts', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    const calls = mockFetch([{ body: ok }])
    await searchWeb('q', { num: 999 })
    expect(JSON.parse(String(calls[0].init.body)).max_results).toBe(20)
  })

  it('uses the general topic so company pages are not filtered out', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    const calls = mockFetch([{ body: ok }])
    await searchWeb('q', { num: 3, recencyDays: 365 })
    expect(JSON.parse(String(calls[0].init.body)).topic).toBe('general')
  })

  it('skips malformed result URLs instead of emitting them', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    mockFetch([{ body: { results: [{ url: 'not-a-url', title: 'bad' }, { url: 'https://ok.example.com/x' }] } }])
    const { results: res } = await searchWeb('q', { num: 5 })
    expect(res).toHaveLength(1)
    expect(res[0].url).toBe('https://ok.example.com/x')
  })

  it('throws a named error when the key is missing', async () => {
    delete process.env.TAVILY_API_KEY
    expect(searchWeb('q', { num: 3 })).rejects.toThrow(/TAVILY_API_KEY is not set/)
  })

  // Both providers are on free tiers, so a silent credits number would make
  // hitting the allowance invisible until it fails.
  it('reports the credits Tavily actually charged', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    mockFetch([{ body: { results: [], usage: { credits: 1 } } }])
    expect((await searchWeb('q', { num: 3 })).credits).toBe(1)
  })

  it('reports zero credits when the provider omits usage', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    mockFetch([{ body: { results: [] } }])
    expect((await searchWeb('q', { num: 3 })).credits).toBe(0)
  })
})

describe('web-research: readPage', () => {
  it('returns the extracted markdown body', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    mockFetch([{ body: { results: [{ url: 'https://ok.example.com/a', raw_content: '# Title\n\nBody text.' }], failed_results: [] } }])
    const res = await readPage('https://ok.example.com/a')
    expect(res?.content).toContain('Body text.')
  })

  it('reports credits on a successful extraction', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    mockFetch([{ body: { results: [{ url: 'https://ok.example.com/a', raw_content: 'body' }], usage: { credits: 1 } } }])
    expect((await readPage('https://ok.example.com/a'))?.credits).toBe(1)
  })

  // The trap this guards: Tavily returns HTTP 200 even when every URL failed.
  // Treating that as success records an empty read as a fetched page.
  it('returns null when a 200 carries no results and no error detail', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    mockFetch([{ body: { results: [], failed_results: [] } }])
    expect(await readPage('https://ok.example.com/a')).toBeNull()
  })

  it('returns null when the URL is in failed_results without a message', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    mockFetch([{ body: { results: [], failed_results: [{ url: 'https://ok.example.com/a' }] } }])
    expect(await readPage('https://ok.example.com/a')).toBeNull()
  })

  it('throws with the reason when Tavily reports a per-URL failure', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    mockFetch([{ body: { results: [], failed_results: [{ url: 'https://ok.example.com/a', error: '403 Forbidden' }] } }])
    expect(readPage('https://ok.example.com/a')).rejects.toThrow(/403 Forbidden/)
  })

  it('refuses to ask the provider to probe non-public URLs', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    const calls = mockFetch([{ body: { results: [] } }])
    // SSRF gate: the app must not become a proxy for internal addresses.
    for (const bad of [
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:3000/admin',
      'file:///etc/passwd',
      'http://10.0.0.5/internal',
    ]) {
      expect(await readPage(bad)).toBeNull()
    }
    expect(calls).toHaveLength(0)
  })

  it('sends the key as a bearer token, not in the body', async () => {
    process.env.TAVILY_API_KEY = 'tvly-secret'
    const calls = mockFetch([{ body: { results: [{ url: 'https://ok.example.com/a', raw_content: 'x' }] } }])
    await readPage('https://ok.example.com/a')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tvly-secret')
    expect(String(calls[0].init.body)).not.toContain('tvly-secret')
  })
})
