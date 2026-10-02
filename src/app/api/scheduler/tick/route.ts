import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/api-utils'
import { isSchedulerDisabled, schedulerKeyMatches } from '@/lib/scheduler-auth'
import { schedulerCycle } from '@/lib/scheduler'

// GET|POST /api/scheduler/tick?key=…
//
// Thin authenticated wrapper. The scheduling logic lives in lib/scheduler.ts
// because the same cycle also runs on an in-process interval (see
// instrumentation.ts) — this route is for cron/launchd and external drivers.

async function handler(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  if (isSchedulerDisabled()) {
    return NextResponse.json({ error: 'Scheduler disabled: SCHEDULER_KEY is not set' }, { status: 503 })
  }
  if (!schedulerKeyMatches(searchParams.get('key'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Returns immediately after queueing fire-and-forget work.
  const result = await schedulerCycle({ purge: searchParams.get('purge') === '1' })
  return NextResponse.json(result)
}

export const GET = rateLimit({ max: 60, key: 'scheduler' })(handler)
export const POST = rateLimit({ max: 60, key: 'scheduler' })(handler)