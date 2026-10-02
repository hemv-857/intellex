import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SOURCES_PAGE_SIZE } from '@/lib/limits'
import { visibleTaskIds } from '@/lib/visibility'

// GET /api/sources?q=&host=&status=  -> list all sources across tasks
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.toLowerCase() || undefined
  const host = searchParams.get('host') || undefined
  const status = searchParams.get('status') || undefined

  const where: any = {}
  if (status && status !== 'all') where.fetchStatus = status
  if (host) where.hostName = { contains: host }
  if (q) {
    where.OR = [
      { url: { contains: q } },
      { title: { contains: q } },
      { snippet: { contains: q } },
      { hostName: { contains: q } },
    ]
  }

  const visibleIds = await visibleTaskIds()
  const sources = await db.dataSource.findMany({
    where: { ...where, taskId: { in: visibleIds } },
    orderBy: { createdAt: 'desc' },
    take: SOURCES_PAGE_SIZE,
    include: { task: { select: { id: true, title: true } } },
  })

  return NextResponse.json({
    sources: sources.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title,
      snippet: s.snippet,
      hostName: s.hostName,
      favicon: s.favicon,
      publishedTime: s.publishedTime,
      fetchStatus: s.fetchStatus,
      tokensUsed: s.tokensUsed,
      contentExcerpt: s.contentExcerpt,
      fetchedAt: s.fetchedAt,
      taskId: s.taskId,
      taskTitle: s.task.title,
    })),
  })
}
