import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { planWorkflow, buildInitialWorkflow } from '@/lib/ai'
import { logActivity } from '@/lib/api-utils'

// GET /api/tasks?status=&q=  -> list tasks
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const q = searchParams.get('q')?.toLowerCase() || undefined

  const where: any = {}
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
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { _count: { select: { dataItems: true, sources: true } } },
  })

  const result = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    prompt: t.prompt,
    status: t.status,
    objective: t.objective,
    tags: t.tags ? safeArr(t.tags) : [],
    stats: t.stats ? safeObj(t.stats) : { items: 0, sources: 0, valid: 0, duplicates: 0, tokens: 0 },
    progress: t.progress ? safeObj(t.progress) : null,
    itemCount: (t as any)._count?.dataItems ?? 0,
    sourceCount: (t as any)._count?.sources ?? 0,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    error: t.error,
  }))

  return NextResponse.json({ tasks: result })
}

// POST /api/tasks  -> create a task from a natural-language prompt
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any))
  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

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
}

function safeArr(s: string): any[] {
  try { return JSON.parse(s) } catch { return [] }
}
function safeObj(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}
