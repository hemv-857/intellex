import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { safeApi, rateLimit } from '@/lib/api-utils'

// GET /api/templates/[id] -> one template
export function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return safeApi(async () => {
    const { id } = await params
    const t = await db.template.findUnique({ where: { id } })
    if (!t) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    return NextResponse.json({
      template: {
        id: t.id,
        name: t.name,
        prompt: t.prompt,
        icon: t.icon,
        fields: safeArr(t.fields),
        tags: safeArr(t.tags),
        isBuiltIn: t.isBuiltIn,
        useCount: t.useCount,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      },
    })
  })
}

// POST /api/templates/[id] -> record a use (drives the "used Nx" badge)
export const POST = rateLimit({ max: 60, key: 'template-use' })(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const t = await db.template.findUnique({ where: { id }, select: { id: true } })
  if (!t) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  const updated = await db.template.update({ where: { id }, data: { useCount: { increment: 1 } }, select: { useCount: true } })
  return NextResponse.json({ ok: true, useCount: updated.useCount })
})

// DELETE /api/templates/[id] -> refuse if isBuiltIn
export function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return safeApi(async () => {
    const { id } = await params
    const t = await db.template.findUnique({ where: { id }, select: { isBuiltIn: true, name: true } })
    if (!t) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    if (t.isBuiltIn) {
      return NextResponse.json(
        { error: 'Built-in templates cannot be deleted' },
        { status: 400 },
      )
    }
    await db.template.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  })
}

function safeArr(s?: string | null): any[] {
  if (!s) return []
  try {
    return JSON.parse(s)
  } catch {
    return []
  }
}
