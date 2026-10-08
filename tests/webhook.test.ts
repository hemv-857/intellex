import { describe, expect, it } from 'bun:test'
import { parseWebhook } from '../src/lib/webhook'

// Webhook settings parsing, including the failure modes that would otherwise
// result in posting a full workspace backup somewhere unintended.

describe('parseWebhook', () => {
  it('returns null when nothing is configured', () => {
    expect(parseWebhook({})).toBeNull()
    expect(parseWebhook({ webhook: null })).toBeNull()
    expect(parseWebhook({ webhook: 'https://example.com/hook' })).toBeNull()
    expect(parseWebhook({ webhook: [] })).toBeNull()
    expect(parseWebhook({ webhook: { enabled: true } })).toBeNull()
  })

  it('reads a complete configuration', () => {
    const w = parseWebhook({
      webhook: { url: 'https://example.com/hook', enabled: true, backupIntervalMinutes: 720 },
    })
    expect(w).toEqual({
      url: 'https://example.com/hook',
      enabled: true,
      backupIntervalMinutes: 720,
      lastBackupAt: null,
      lastResult: null,
    })
  })

  it('defaults enabled to true, since configuring a webhook is the intent', () => {
    expect(parseWebhook({ webhook: { url: 'https://x.test' } })?.enabled).toBe(true)
  })

  it('respects an explicit disable', () => {
    expect(parseWebhook({ webhook: { url: 'https://x.test', enabled: false } })?.enabled).toBe(false)
  })

  it('falls back to a 6-hour interval for a missing or nonsense value', () => {
    expect(parseWebhook({ webhook: { url: 'https://x.test' } })?.backupIntervalMinutes).toBe(360)
    expect(parseWebhook({ webhook: { url: 'https://x.test', backupIntervalMinutes: 'soon' } })?.backupIntervalMinutes).toBe(360)
    expect(parseWebhook({ webhook: { url: 'https://x.test', backupIntervalMinutes: 0 } })?.backupIntervalMinutes).toBe(360)
  })

  // Below the 15-minute floor the endpoint would be hit on every purge cycle.
  it('refuses an interval under the floor', () => {
    expect(parseWebhook({ webhook: { url: 'https://x.test', backupIntervalMinutes: 5 } })?.backupIntervalMinutes).toBe(360)
  })

  it('carries the last backup result through for display', () => {
    const w = parseWebhook({
      webhook: { url: 'https://x.test', lastBackupAt: '2026-01-01T00:00:00.000Z', lastResult: 'ok' },
    })
    expect(w?.lastBackupAt).toBe('2026-01-01T00:00:00.000Z')
    expect(w?.lastResult).toBe('ok')
  })

  it('ignores a non-string lastBackupAt rather than propagating it', () => {
    expect(parseWebhook({ webhook: { url: 'https://x.test', lastBackupAt: 12345 } })?.lastBackupAt).toBeNull()
  })
})