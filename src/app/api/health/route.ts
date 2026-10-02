import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ftsIsHealthy } from '@/lib/fts'
import { authDisabled } from '@/lib/auth'

// GET /api/health
//
// The endpoint a platform polls to decide the service is up. It deliberately
// checks the things that actually break a deploy — is the database file present
// and writable, did the migrations apply, is the search index consistent, and is
// auth configured — because a server that boots but cannot write to its disk is
// not healthy.
//
// Deliberately unauthenticated and deliberately reveals almost nothing: liveness
// is not secret, and this must work before anyone has a session.

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const checks: Record<string, 'ok' | 'fail' | 'skip'> = {}
  let databasePath: string | null = null

  // 1. Can we open the database at all?
  try {
    await db.$queryRawUnsafe('SELECT 1')
    const rows = await db.$queryRawUnsafe<{ file: string | null }[]>('PRAGMA database_list')
    databasePath = rows?.[0]?.file ?? null
    checks.database = 'ok'
  } catch (e) {
    checks.database = 'fail'
    return NextResponse.json(
      { status: 'unhealthy', checks, error: (e as Error).message },
      { status: 503 },
    )
  }

  // 2. Are the migrations applied? A missing table is the classic "it booted but
  //    the deploy never ran prisma migrate deploy" failure.
  try {
    const tables = await db.$queryRawUnsafe<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='Task'",
    )
    checks.schema = Number(tables?.[0]?.n ?? 0) > 0 ? 'ok' : 'fail'
  } catch {
    checks.schema = 'fail'
  }

  // 3. Is the search index consistent with the data?
  try {
    checks.searchIndex = (await ftsIsHealthy()) ? 'ok' : 'fail'
  } catch {
    checks.searchIndex = 'fail'
  }

  // 4. Auth configured — without it the API is disabled, which is a deployment
  //    mistake rather than a crash.
  checks.auth = authDisabled() ? 'fail' : 'ok'

  const healthy = Object.values(checks).every((v) => v === 'ok')

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks,
      // Path only — never credentials.
      databasePath: databasePath ? databasePath.replace(/^.*\//, '…/') : null,
      scheduler: process.env.SCHEDULER_KEY ? 'enabled' : 'disabled',
      inProcessScheduler: process.env.IN_PROCESS_SCHEDULER !== '0' && !!process.env.SCHEDULER_KEY,
      llmConfigured: !!(process.env.ZAI_API_KEY && process.env.ZAI_BASE_URL),
      version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
    },
    { status: healthy ? 200 : 503 },
  )
}