import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity, rateLimit, schemas, validateBody } from '@/lib/api-utils'
import { createShare, shareState, DEFAULT_SHARE_TTL_DAYS } from '@/lib/share'

// GET  /api/tasks/[id]/share -> existing links for this task
// POST /api/tasks/[id]/share { label?, ttlDays? } -> create a link (token shown once)
// DELETE /api/tasks/[id]/share { shareId } -> revoke a link

const MAX_LINKS_PER_TASK = 10

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const task = await db.task.findUnique({ where: { id }, select: { id: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const links = await db.shareLink.findMany({
    where: { taskId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, expiresAt: true, revokedAt: true, viewCount: true, createdAt: true },
  })

  return NextResponse.json({
    links: links.map((l) => ({
      id: l.id,
      label: l.label,
      state: shareState(l),
      expiresAt: l.expiresAt,
      viewCount: l.viewCount,
      createdAt: l.createdAt,
    })),
  })
}

export const POST = rateLimit({ max: 20, key: 'share-create' })(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = validateBody(
    schemas.shareCreate,
    typeof body.label === 'string' || typeof body.ttlDays === 'number' ? body : {},
  )
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const task = await db.task.findUnique({ where: { id }, select: { id: true, title: true, status: true, trashedAt: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.status !== 'completed') {
    return NextResponse.json({ error: 'Only a completed collection can be shared.' }, { status: 400 })
  }
  if (task.trashedAt) {
    return NextResponse.json({ error: 'Restore the task from trash before sharing it.' }, { status: 400 })
  }

  const existing = await db.shareLink.count({ where: { taskId: id, revokedAt: null } })
  if (existing >= MAX_LINKS_PER_TASK) {
    return NextResponse.json({ error: `This task already has ${existing} active links. Revoke one first.` }, { status: 409 })
  }

  const share = await createShare({ taskId: id, label: parsed.data.label, ttlDays: parsed.data.ttlDays ?? DEFAULT_SHARE_TTL_DAYS })

  await logActivity({
    type: 'share_created',
    taskId: id,
    message: `Created a share link for "${task.title}"`,
    meta: { shareId: share.id, expiresAt: share.expiresAt },
  })

  // The raw token is returned exactly once and never stored.
  return NextResponse.json({
    share: {
      id: share.id,
      label: share.label,
      expiresAt: share.expiresAt,
      path: `/share/${share.token}`,
    },
    notice: 'Copy this link now — it cannot be shown again.',
  })
})

export const DELETE = rateLimit({ max: 30, key: 'share-revoke' })(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const body = await req.json().catch(() => ({} as any))
  const shareId = typeof body?.shareId === 'string' ? body.shareId : ''
  if (!shareId) return NextResponse.json({ error: 'shareId is required' }, { status: 400 })

  // Scoped by taskId so one task's id cannot revoke another's link.
  const result = await db.shareLink.updateMany({
    where: { id: shareId, taskId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (result.count === 0) return NextResponse.json({ error: 'Link not found or already revoked' }, { status: 404 })

  await logActivity({ type: 'share_revoked', taskId: id, message: 'Revoked a share link', meta: { shareId } })
  return NextResponse.json({ ok: true })
})