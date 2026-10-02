import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity, rateLimit, schemas, validateBody } from '@/lib/api-utils'
import { duplicateTask } from '@/lib/duplicate'

// POST /api/tasks/[id]/duplicate
// Clones a task's prompt + planned schema into a NEW planned task (does NOT copy
// collected dataItems/sources — the user runs the new task fresh). Returns the new task.
export const POST = rateLimit({ max: 30, key: 'duplicate' })(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const result = await duplicateTask(id)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 404 })
  return NextResponse.json({ task: { id: result.id, title: result.title, status: 'planned' } })
})