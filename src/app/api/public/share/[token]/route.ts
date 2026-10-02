import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/api-utils'
import { resolveShare, type ShareState } from '@/lib/share'

// GET /api/public/share/[token]
//
// The one route in the app that is reachable without APP_TOKEN. It is scoped as
// tightly as possible:
//
//   * the raw token is the only credential, checked timing-safe against a hash
//   * it resolves to exactly ONE completed, non-trashed task
//   * the payload is that task's dataset and schema — never other tasks,
//     prompts of other tasks, the activity log, or anything else in the database
//   * links expire (30 days by default) and can be revoked
//   * rate limited per IP

const MAX_RECORDS = 2000

export const GET = rateLimit({ max: 60, key: 'public-share' })(async (_req: NextRequest, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params
  const decoded = safeDecode(token)

  const resolved = await resolveShare(decoded)
  if (!resolved) {
    return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  }
  if (resolved.state !== 'active' || !resolved.link) {
    const message =
      resolved.state === 'revoked'
        ? 'This link has been revoked by its owner.'
        : resolved.state === 'expired'
          ? 'This link has expired.'
          : 'This link is not valid.'
    return NextResponse.json({ error: message, state: resolved.state }, { status: 410 })
  }

  const { link } = resolved
  const task = await db.task.findUnique({
    where: { id: link.taskId },
    select: {
      id: true,
      title: true,
      objective: true,
      fields: true,
      tags: true,
      stats: true,
      completedAt: true,
      _count: { select: { dataItems: true, sources: true } },
    },
  })
  if (!task) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })

  const [items, sources] = await Promise.all([
    db.dataItem.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'asc' },
      take: MAX_RECORDS,
      select: { id: true, title: true, summary: true, data: true, confidence: true, valid: true, contentDate: true },
    }),
    db.dataSource.findMany({
      where: { taskId: task.id },
      orderBy: { rank: 'asc' },
      take: 200,
      select: { id: true, url: true, title: true, hostName: true, fetchStatus: true },
    }),
  ])

  // Count the view best-effort; a failed counter must not break the read.
  db.shareLink
    .update({ where: { id: link.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {})

  return NextResponse.json({
    task: {
      title: task.title,
      objective: task.objective,
      fields: safeArr(task.fields),
      tags: safeArr(task.tags),
      stats: safeObj(task.stats),
      completedAt: task.completedAt,
      recordCount: task._count.dataItems,
      sourceCount: task._count.sources,
    },
    share: {
      label: link.label,
      expiresAt: link.expiresAt,
      truncated: task._count.dataItems > items.length,
    },
    records: items.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      data: safeObj(r.data),
      confidence: r.confidence,
      valid: r.valid,
      contentDate: r.contentDate,
    })),
    sources,
  })
})

function safeDecode(token: string): string {
  try {
    return decodeURIComponent(token)
  } catch {
    return token
  }
}

function safeArr(s?: string | null): any[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function safeObj(s?: string | null): Record<string, unknown> {
  if (!s) return {}
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export type { ShareState }