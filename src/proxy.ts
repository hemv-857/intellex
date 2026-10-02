import { NextResponse, type NextRequest } from 'next/server'

// Intellex API gate. Single-tenant: one shared APP_TOKEN exchanged for an
// httpOnly session cookie. Fails closed — with no APP_TOKEN set, the whole API
// stays disabled rather than opening up.
//
// /api/auth/*   — the login handshake itself, must be reachable unauthenticated.
// /api/scheduler/* — keeps its own SCHEDULER_KEY boundary so a cron driver only
//                    needs one credential, and is not gated here.
// /api/health     — platform liveness probe; must answer before anyone can log in.
// /api/public/* — share links authenticate with their own single-purpose token.
//                  The handlers under it must stay scoped to that token: never
//                  widen one to answer questions about anything else.
const EXEMPT_PREFIXES = ['/api/auth/', '/api/scheduler/', '/api/public/', '/api/health']

// Constant-time compare without node:crypto, which is unavailable on the edge
// runtime this file runs on.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (!pathname.startsWith('/api/')) return NextResponse.next()
  if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()

  const expected = process.env.APP_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: 'Authentication is not configured. Set APP_TOKEN to enable the API.' },
      { status: 503 },
    )
  }

  // Cookie first, bearer second so curl / cron / scripts can authenticate.
  const cookie = req.cookies.get('intellex_session')?.value
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const provided = cookie || bearer || ''

  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Defence in depth against CSRF. The session cookie is already SameSite=Lax so
  // a cross-site form POST cannot carry it, but a same-site subdomain or a
  // browser without Lax enforcement would still land here. A cross-origin
  // mutation is refused outright. No Origin header (curl, server-to-server) is
  // allowed through.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin')
    if (origin && origin !== req.nextUrl.origin) {
      return NextResponse.json({ error: 'Cross-origin request refused' }, { status: 403 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}