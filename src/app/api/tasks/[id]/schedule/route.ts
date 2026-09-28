import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity, validateBody, schemas } from '@/lib/api-utils'

// ---------------------------------------------------------------------------
// Schedule config shape (stored as JSON string in Task.schedule)
// ---------------------------------------------------------------------------

interface ScheduleConfig {
  enabled: boolean
  intervalMinutes: number
  nextRunAt: string | null
  lastRunAt: string | null
}

const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: false,
  intervalMinutes: 60,
  nextRunAt: null,
  lastRunAt: null,
}

function parseSchedule(raw: string | null | undefined): ScheduleConfig {
  if (!raw) return { ...DEFAULT_SCHEDULE }
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ...DEFAULT_SCHEDULE }
    }
    const intervalMinutes = Number(parsed.intervalMinutes)
    return {
      enabled: !!parsed.enabled,
      intervalMinutes:
        Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 60,
      nextRunAt: parsed.nextRunAt ? String(parsed.nextRunAt) : null,
      lastRunAt: parsed.lastRunAt ? String(parsed.lastRunAt) : null,
    }
  } catch {
    return { ...DEFAULT_SCHEDULE }
  }
}

// GET /api/tasks/[id]/schedule -> current schedule for the task
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const task = await db.task.findUnique({ where: { id }, select: { schedule: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const schedule = parseSchedule(task.schedule)
  return NextResponse.json({ schedule })
}

// POST /api/tasks/[id]/schedule  { enabled: boolean, intervalMinutes?: number (min 15) }
//   - When enabling: nextRunAt = now (so scheduler picks it up on the next tick)
//   - When disabling: nextRunAt = null
//   - Preserves lastRunAt if present
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const task = await db.task.findUnique({
    where: { id },
    select: { id: true, title: true, schedule: true },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const body = await req.json().catch(() => ({} as any))
  const parsed = validateBody(schemas.schedule, body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { enabled } = parsed.data
  const existing = parseSchedule(task.schedule)
  const intervalMinutes =
    parsed.data.intervalMinutes ?? existing.intervalMinutes ?? 60

  const now = new Date()
  const newSchedule: ScheduleConfig = {
    enabled,
    intervalMinutes,
    nextRunAt: enabled ? now.toISOString() : null,
    lastRunAt: existing.lastRunAt ?? null,
  }

  await db.task.update({
    where: { id },
    data: { schedule: JSON.stringify(newSchedule) },
  })

  await logActivity({
    type: 'task_scheduled',
    taskId: id,
    message: enabled
      ? `Scheduled "${task.title}" every ${intervalMinutes} min`
      : `Disabled schedule for "${task.title}"`,
    meta: { enabled, intervalMinutes, nextRunAt: newSchedule.nextRunAt },
  })

  return NextResponse.json({ schedule: newSchedule })
}
