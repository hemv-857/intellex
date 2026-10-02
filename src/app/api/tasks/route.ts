import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { planWorkflow, buildInitialWorkflow } from '@/lib/ai'
import { logActivity, rateLimit, schemas, validateBody } from '@/lib/api-utils'

// GET /api/tasks?status=&q=&trashed=false  -> list tasks (excludes trashed by default)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const q = searchParams.get('q')?.toLowerCase() || undefined
  const trashed = searchParams.get('trashed') === 'true'

  const where: any = {}
  if (trashed) {
    where.NOT = { trashedAt: null }
  } else {
    where.trashedAt = null
  }
  if (status && status !== 'all') where.status = status
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { prompt: { contains: q } },
      { objective: { contains: q } },
    ]
  }

  const tasks = await db.task.findMany({
    where,
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: { _count: { select: { dataItems: true, sources: true } } },
  })

  // Fetch per-record confidence for all listed tasks in ONE query, bucket in JS.
  // This powers the mini confidence sparkline on task cards without N+1 queries.
  const taskIds = tasks.map((t) => t.id)
  const allItems = taskIds.length > 0
    ? await db.dataItem.findMany({
        where: { taskId: { in: taskIds } },
        select: { taskId: true, confidence: true },
      })
    : []
  const bucketsByTask = new Map<string, { high: number; medium: number; low: number }>()
  for (const it of allItems) {
    const b = bucketsByTask.get(it.taskId) || { high: 0, medium: 0, low: 0 }
    if (it.confidence >= 75) b.high++
    else if (it.confidence >= 50) b.medium++
    else b.low++
    bucketsByTask.set(it.taskId, b)
  }

  const result = tasks.map((t) => {
    const stats = t.stats ? safeObj(t.stats) : { items: 0, sources: 0, valid: 0, duplicates: 0, tokens: 0 }
    // Compute a 0-100 data-quality score: weighted blend of validity rate, avg confidence
    // (proxy: valid/items), source coverage, and low duplicate ratio.
    const items = Number(stats.items ?? (t as any)._count?.dataItems ?? 0) || 0
    const valid = Number(stats.valid ?? 0) || 0
    const sources = Number(stats.sources ?? (t as any)._count?.sources ?? 0) || 0
    const dups = Number(stats.duplicates ?? 0) || 0
    let qualityScore = 0
    if (t.status === 'completed' && items > 0) {
      const validityRate = valid / items // 0..1
      const dupPenalty = Math.min(1, dups / items) // 0..1
      const sourceCoverage = Math.min(1, sources / 8) // 8 sources = full
      qualityScore = Math.round(
        (validityRate * 50) + (sourceCoverage * 25) + ((1 - dupPenalty) * 25)
      )
    }
    return {
      id: t.id,
      title: t.title,
      prompt: t.prompt,
      status: t.status,
      objective: t.objective,
      tags: t.tags ? safeArr(t.tags) : [],
      stats,
      progress: t.progress ? safeObj(t.progress) : null,
      itemCount: (t as any)._count?.dataItems ?? 0,
      sourceCount: (t as any)._count?.sources ?? 0,
      pinned: t.pinned,
      trashedAt: t.trashedAt,
      qualityScore,
      confidenceBuckets: bucketsByTask.get(t.id) || { high: 0, medium: 0, low: 0 },
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      error: t.error,
    }
  })

  return NextResponse.json({ tasks: result })
}

// POST /api/tasks  -> create a task from a natural-language prompt.
// Rate limited because each call bills one LLM planner completion.
export const POST = rateLimit({ max: 30, key: 'task-create' })(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({} as any))
  const parsed = validateBody(schemas.createTask, body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const prompt = parsed.data.prompt.trim()

  try {
    const plan = await planWorkflow(prompt)
    const workflow = buildInitialWorkflow()

    const task = await db.task.create({
      data: {
        title: plan.title,
        prompt,
        status: 'planned',
        objective: plan.objective,
        fields: JSON.stringify(plan.fields),
        searchQueries: JSON.stringify(plan.searchQueries),
        sourceStrategy: JSON.stringify(plan.sourceStrategy),
        validationRules: JSON.stringify(plan.validationRules),
        tags: JSON.stringify(plan.tags),
        workflow: JSON.stringify(workflow),
        progress: JSON.stringify({ step: 'plan', message: 'Workflow ready. Click Run to execute.', current: 1, total: 1 }),
        stats: JSON.stringify({ items: 0, sources: 0, valid: 0, duplicates: 0, tokens: 0 }),
      },
    })

    await logActivity({
      type: 'task_created',
      taskId: task.id,
      message: `Created task "${task.title}"`,
      meta: { title: task.title, prompt: prompt.slice(0, 200), tags: plan.tags },
    })

    return NextResponse.json({
      task: {
        id: task.id,
        title: task.title,
        prompt: task.prompt,
        status: task.status,
        objective: task.objective,
        fields: plan.fields,
        searchQueries: plan.searchQueries,
        sourceStrategy: plan.sourceStrategy,
        validationRules: plan.validationRules,
        tags: plan.tags,
        workflow,
        createdAt: task.createdAt,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Failed to plan workflow' }, { status: 500 })
  }
})

function safeArr(s: string): any[] {
  try { return JSON.parse(s) } catch { return [] }
}
function safeObj(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}
