// Webhook delivery, tested with a mocked fetch.
//
// The real delivery path could not be exercised with a local receiver: the SSRF
// guard correctly refuses localhost, so pointing the app at a receiver on
// 127.0.0.1 is impossible by design. Mocking fetch verifies the request the app
// would make without weakening that guard.

import { describe, expect, it, afterEach } from 'bun:test'
import { postWebhook } from '../src/lib/webhook'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

interface Call { url: string; init: RequestInit }

function mockFetch(responses: { status?: number; body?: string }[]): Call[] {
  const calls: Call[] = []
  let i = 0
  globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    const r = responses[Math.min(i++, responses.length - 1)]
    return new Response(r.body ?? 'ok', { status: r.status ?? 200 })
  }) as typeof fetch
  return calls
}

describe('postWebhook', () => {
  it('POSTs JSON and reports success', async () => {
    const calls = mockFetch([{ status: 200 }])
    const res = await postWebhook('https://example.com/hook', { type: 'backup', backup: {} })

    expect(res.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://example.com/hook')
    expect(calls[0].init.method).toBe('POST')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ type: 'backup', backup: {} })
  })

  it('refuses non-public URLs without making a request', async () => {
    const calls = mockFetch([{ status: 200 }])
    for (const bad of [
      'http://localhost/hook',
      'http://127.0.0.1/hook',
      'http://169.254.169.254/latest/meta-data',
      'http://10.1.2.3/hook',
      'http://192.168.0.5/hook',
      'file:///etc/passwd',
      'ftp://example.com/x',
      'not-a-url',
    ]) {
      const res = await postWebhook(bad, { type: 'backup' })
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/public http\(s\)/)
    }
    expect(calls).toHaveLength(0)
  })

  it('surfaces the endpoint error body, which is the only clue about a bad URL shape', async () => {
    mockFetch([{ status: 404, body: 'no such webhook' }])
    const res = await postWebhook('https://example.com/hook', { type: 'backup' })
    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
    expect(res.error).toMatch(/no such webhook/)
  })

  it('reports a network failure without throwing', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const res = await postWebhook('https://example.com/hook', { type: 'backup' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/ECONNREFUSED/)
  })

  // A runaway dataset should produce a clear message, not a hung POST.
  it('refuses an oversized payload', async () => {
    const calls = mockFetch([{ status: 200 }])
    const huge = { type: 'backup', blob: 'x'.repeat(65 * 1024 * 1024) }
    const res = await postWebhook('https://example.com/hook', huge)

    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/too large/)
    expect(calls).toHaveLength(0)
  })

  it('sets an abort signal so a hung endpoint cannot stall the scheduler', async () => {
    const calls = mockFetch([{ status: 200 }])
    await postWebhook('https://example.com/hook', { type: 'backup' })
    expect(calls[0].init.signal).toBeDefined()
  })
})