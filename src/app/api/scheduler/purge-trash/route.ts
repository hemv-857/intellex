import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/api-utils'
import { isSchedulerDisabled, schedulerKeyMatches } from '@/lib/scheduler-auth'
import { purgeExpiredTrash, TRASH_RETENTION_DAYS } from '@/lib/scheduler'

// POST /api/scheduler/purge-trash?key=...
// Hard-deletes tasks that have been in the trash for more than TRASH_RETENTION_DAYS.
// Idempotent + safe to call repeatedly. The work itself lives in lib/scheduler.ts
// because the in-process scheduler also runs it.

export const POST = rateLimit({ max: 10, key: 'purge-trash' })(async (req: NextRequest) => {
  const key = req.nextUrl?.searchParams?.get('key') || new URL(req.url).searchParams.get('key')
  if (isSchedulerDisabled()) {
    return NextResponse.json({ error: 'Scheduler disabled: SCHEDULER_KEY is not set' }, { status: 503 })
  }
  if (!schedulerKeyMatches(key)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await purgeExpiredTrash()
  return NextResponse.json({ ...result, maxAgeDays: TRASH_RETENTION_DAYS })
})

export const GET = POST