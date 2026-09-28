import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity, rateLimit } from '@/lib/api-utils'

const MAX_AGE_DAYS = 30

// POST /api/scheduler/purge-trash?key=...
// Hard-deletes tasks that have been in the trash for more than MAX_AGE_DAYS.
// Idempotent + safe to call repeatedly.
export const POST = rateLimit({ max: 10, key: 'purge-trash' })(async (req: NextRequest) => {
  const key = req.nextUrl?.searchParams?.get('key') || new URL(req.url).searchParams.get('key')
  if (key !== (process.env.SCHEDULER_KEY || 'intellex-dev')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000)

  const stale = await db.task.findMany({
    where: { trashedAt: { not: null, lt: cutoff } },
    select: { id: true, title: true, trashedAt: true },
  })

  if (stale.length === 0) {
    return NextResponse.json({ ok: true, purged: 0, message: 'No stale trash.' })
  }

  for (const t of stale) {
    await logActivity({
      type: 'task_deleted',
      taskId: t.id,
      message: `Auto-purged task "${t.title}" from trash (older than ${MAX_AGE_DAYS} days)`,
      meta: { autoPurged: true, trashedAt: t.trashedAt, title: t.title },
    })
  }
  const r = await db.task.deleteMany({ where: { id: { in: stale.map((t) => t.id) } } })

  return NextResponse.json({
    ok: true,
    purged: r.count,
    maxAgeDays: MAX_AGE_DAYS,
    tasks: stale.map((t) => ({ id: t.id, title: t.title })),
  })
})

export const GET = POST
