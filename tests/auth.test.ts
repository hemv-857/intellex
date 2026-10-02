/// <reference types="bun-types" />
import { afterEach, describe, expect, test } from 'bun:test'
import { authDisabled, tokenMatches, SESSION_COOKIE } from '../src/lib/auth'

const original = process.env.APP_TOKEN

afterEach(() => {
  if (original === undefined) delete process.env.APP_TOKEN
  else process.env.APP_TOKEN = original
})

describe('app auth', () => {
  test('is disabled with no APP_TOKEN and never matches anything', () => {
    delete process.env.APP_TOKEN
    expect(authDisabled()).toBe(true)
    expect(tokenMatches('')).toBe(false)
    expect(tokenMatches('anything')).toBe(false)
    expect(tokenMatches(null)).toBe(false)
    expect(tokenMatches(undefined)).toBe(false)
  })

  test('rejects a plausible default guess', () => {
    process.env.APP_TOKEN = 'a-real-token'
    expect(tokenMatches('intellex-dev')).toBe(false)
    expect(tokenMatches('password')).toBe(false)
  })

  test('accepts only the exact token', () => {
    process.env.APP_TOKEN = 'a-real-token'
    expect(authDisabled()).toBe(false)
    expect(tokenMatches('a-real-token')).toBe(true)
    expect(tokenMatches('a-real-toke')).toBe(false) // length mismatch
    expect(tokenMatches('a-real-tokens')).toBe(false) // prefix
    expect(tokenMatches('A-Real-Token')).toBe(false) // case matters
  })

  test('session cookie is httpOnly and SameSite=Lax so it cannot ride a cross-site POST', () => {
    expect(SESSION_COOKIE).toBe('intellex_session')
  })
})