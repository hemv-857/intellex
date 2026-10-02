import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateBody, schemas } from '@/lib/api-utils'

function safeObj(s?: string | null): any {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}

// GET /api/preferences — returns stored preferences (or defaults)
export async function GET() {
  const row = await db.setting.findUnique({ where: { id: 'singleton' } })
  return NextResponse.json({ preferences: row ? safeObj(row.preferences) : {} })
}

// POST /api/preferences — merge preferences
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parsed = validateBody(schemas.preferences, body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const data = parsed.data

  const row = await db.setting.findUnique({ where: { id: 'singleton' } })
  const current = row ? safeObj(row.preferences) : {}
  const merged = { ...current, ...data }

  await db.setting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', preferences: JSON.stringify(merged) },
    update: { preferences: JSON.stringify(merged) },
  })

  return NextResponse.json({ ok: true, preferences: merged })
}
