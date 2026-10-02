/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'
import { hashShareToken, generateShareToken, tokensMatch, shareState, DEFAULT_SHARE_TTL_DAYS } from '../src/lib/share'

describe('share tokens', () => {
  test('generates unguessable, url-safe tokens', () => {
    const a = generateShareToken()
    const b = generateShareToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(40)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/) // base64url, safe in a URL
  })

  test('stores only a hash, never the token', () => {
    const token = generateShareToken()
    const hash = hashShareToken(token)
    expect(hash).toHaveLength(64) // sha256 hex
    expect(hash).not.toContain(token)
    expect(hashShareToken(token)).toBe(hash) // deterministic
  })

  test('verifies the right token and rejects everything else', () => {
    const token = generateShareToken()
    const hash = hashShareToken(token)
    expect(tokensMatch(token, hash)).toBe(true)
    expect(tokensMatch(`${token}x`, hash)).toBe(false)
    expect(tokensMatch(token.slice(0, -1), hash)).toBe(false)
    expect(tokensMatch('', hash)).toBe(false)
    expect(tokensMatch('guessed', hash)).toBe(false)
  })

  test('lifecycle states', () => {
    const now = new Date('2026-10-02T12:00:00Z')
    expect(shareState({ revokedAt: null, expiresAt: null }, now)).toBe('active')
    expect(shareState({ revokedAt: new Date('2026-01-01'), expiresAt: null }, now)).toBe('revoked')
    expect(shareState({ revokedAt: null, expiresAt: new Date('2026-01-01') }, now)).toBe('expired')
    expect(shareState({ revokedAt: null, expiresAt: new Date('2026-11-01') }, now)).toBe('active')
    // Expiry is inclusive of the boundary instant.
    expect(shareState({ revokedAt: null, expiresAt: now }, now)).toBe('expired')
    // Revocation wins over a still-valid expiry.
    expect(shareState({ revokedAt: new Date('2026-10-01'), expiresAt: new Date('2026-11-01') }, now)).toBe('revoked')
  })

  test('links expire by default rather than living forever', () => {
    expect(DEFAULT_SHARE_TTL_DAYS).toBeGreaterThan(0)
    expect(DEFAULT_SHARE_TTL_DAYS).toBeLessThanOrEqual(365)
  })
})