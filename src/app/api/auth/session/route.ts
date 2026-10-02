import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, authDisabled, tokenMatches } from '@/lib/auth'

// GET /api/auth/session -> { authenticated, authDisabled }
export async function GET(req: NextRequest) {
  const disabled = authDisabled()
  const authenticated = !disabled && tokenMatches(req.cookies.get(SESSION_COOKIE)?.value)
  return NextResponse.json({ authenticated, authDisabled: disabled })
}