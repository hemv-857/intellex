import { db } from '@/lib/db'
import { buildInitialWorkflow } from '@/lib/ai'
import { logActivity } from '@/lib/api-utils'

function safeStr(s: string | null | undefined, fallback = ''): string {
  return s ?? fallback
}

// One place that knows how to clone a task, shared by the single duplicate route
// and the bulk action so the two can never drift.

export type DuplicateResult = { id: string; title: string; sourceTitle: string } | { error: string }

/**
 * Clones a task's prompt + planned schema into a NEW planned task. Collected
 * dataItems and sources are deliberately not copied — the clone starts empty so
 * it is actually re-collected rather than pretending to be a fresh run of data
 * that is really the original's.
 */
export async function duplicateTask(id: string): Promise<DuplicateResult> {
  const src = await db.task.findUnique({ where: { id } })
  if (!src) return { error: 'Source task not found' }

  const workflow = buildInitialWorkflow()
  // Cloning a clone should not stack suffixes into "(copy) (copy) (copy)".
  const base = src.title.replace(/\s*\(copy(?: \d+)?\)$/i, '')
  const newTitle = `${base} (copy)`.slice(0, 80)

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
      progress: JSON.stringify({ step: 'plan', message: 'Workflow ready. Click Run to execute.', current: 1, total: 0 }),
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

  return { id: dup.id, title: dup.title, sourceTitle: src.title }
}