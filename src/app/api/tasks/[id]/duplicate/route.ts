import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildInitialWorkflow } from '@/lib/ai'
import { logActivity } from '@/lib/api-utils'

function safeStr(s: string | null | undefined, fallback = ''): string {
  return s ?? fallback
}

// POST /api/tasks/[id]/duplicate
// Clones a task's prompt + planned schema into a NEW planned task (does NOT copy
// collected dataItems/sources — the user runs the new task fresh). Returns the new task.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const src = await db.task.findUnique({ where: { id } })
  if (!src) return NextResponse.json({ error: 'Source task not found' }, { status: 404 })

  const workflow = buildInitialWorkflow()
  const newTitle = `${src.title} (copy)`.slice(0, 80)

  const dup = await db.task.create({
    data: {
      title: newTitle,
      prompt: src.prompt,
      status: 'planned',
      objective: safeStr(src.objective, src.prompt),
      fields: safeStr(src.fields, '[]') || null,
      searchQueries: safeStr(src.searchQueries, '[]') || null,
      sourceStrategy: safeStr(src.sourceStrategy, '[]') || null,
      validationRules: safeStr(src.validationRules, '[]') || null,
      tags: safeStr(src.tags, '[]') || null,
      workflow: JSON.stringify(workflow),
      progress: JSON.stringify({ step: 'plan', message: 'Workflow ready. Click Run to execute.', current: 1, total: 1 }),
      stats: JSON.stringify({ items: 0, sources: 0, valid: 0, duplicates: 0, tokens: 0 }),
      templateId: src.templateId,
    },
  })

  await logActivity({
    type: 'task_created',
    taskId: dup.id,
    message: `Duplicated task "${src.title}" → "${newTitle}"`,
    meta: { sourceTaskId: id, sourceTitle: src.title, duplicated: true },
  })

  return NextResponse.json({
    task: {
      id: dup.id,
      title: dup.title,
      status: dup.status,
    },
  })
}
