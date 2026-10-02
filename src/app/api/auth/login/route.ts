import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, authDisabled, tokenMatches, sessionCookieOptions } from '@/lib/auth'
import { rateLimit } from '@/lib/api-utils'

// POST /api/auth/login { token } -> sets the session cookie
export const POST = rateLimit({ max: 10, key: 'auth-login' })(async (req: NextRequest) => {
  if (authDisabled()) {
    return NextResponse.json(
      { error: 'Authentication is not configured. Set APP_TOKEN to enable sign-in.' },
      { status: 503 },
    )
  }

  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''

  if (!tokenMatches(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
  return res
})