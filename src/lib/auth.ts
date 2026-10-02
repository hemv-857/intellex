import { timingSafeEqual } from 'node:crypto'

// Single-tenant auth. Intellex has exactly one operator, so authentication is one
// shared secret (APP_TOKEN) exchanged for an httpOnly session cookie. It fails
// closed: with no APP_TOKEN configured, every API route stays disabled rather
// than falling back to a well-known default.

export const SESSION_COOKIE = 'intellex_session'

export function authDisabled(): boolean {
  return !process.env.APP_TOKEN
}

export function tokenMatches(provided: string | null | undefined): boolean {
  const expected = process.env.APP_TOKEN
  if (!expected || provided == null) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// Session cookie attributes. SameSite=Lax is load-bearing: it stops the browser
// attaching the cookie to cross-site POSTs, which is what makes the mutating
// routes non-CSRF-able without a per-request origin check.
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 30,
} as const