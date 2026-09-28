import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity, validateBody, schemas, safeApi } from '@/lib/api-utils'

// Built-in templates seeded once when the table is empty (idempotent).
const BUILT_IN_TEMPLATES: Array<{ name: string; prompt: string; icon: string; tags: string[] }> = [
  {
    name: 'AI Startup Funding',
    prompt:
      'Find 8 recent AI startup funding rounds with company name, funding amount, investors, date, and a one-line description.',
    icon: '💼',
    tags: ['funding', 'startups', 'ai'],
  },
  {
    name: 'Remote Design Agencies',
    prompt:
      'List 10 remote-first design agencies with name, website, location, services offered, and starting price range.',
    icon: '🎯',
    tags: ['agencies', 'design', 'remote'],
  },
  {
    name: 'Tech Conferences 2025',
    prompt:
      'Collect 12 upcoming technology conferences in 2025 with name, date, location, organizer, and topic.',
    icon: '📅',
    tags: ['events', 'conferences', '2025'],
  },
  {
    name: 'SaaS Pricing Comparison',
    prompt:
      'Gather pricing details for 8 popular project management SaaS tools: product name, free tier limits, starting price, and key features.',
    icon: '📊',
    tags: ['saas', 'pricing', 'comparison'],
  },
  {
    name: 'Bestselling Products',
    prompt:
      'Collect 10 bestselling wireless headphones with product name, brand, price, rating, and key specs.',
    icon: '🛒',
    tags: ['products', 'ecommerce', 'electronics'],
  },
  {
    name: 'AI Research Papers',
    prompt:
      'Find recent AI research papers on retrieval-augmented generation with title, authors, abstract summary, and publication date.',
    icon: '🔬',
    tags: ['research', 'ai', 'papers'],
  },
]

/** Seed built-in templates if none exist yet. Idempotent. */
export async function ensureBuiltInTemplates() {
  const count = await db.template.count()
  if (count > 0) return { seeded: 0, total: count }
  await db.template.createMany({
    data: BUILT_IN_TEMPLATES.map((t) => ({
      name: t.name,
      prompt: t.prompt,
      icon: t.icon,
      tags: JSON.stringify(t.tags),
      isBuiltIn: true,
      useCount: 0,
    })),
  })
  return { seeded: BUILT_IN_TEMPLATES.length, total: BUILT_IN_TEMPLATES.length }
}

// GET /api/templates -> list all templates (built-in first, then by useCount desc)
export function GET() {
  return safeApi(async () => {
    await ensureBuiltInTemplates()
    const templates = await db.template.findMany({
      orderBy: [{ isBuiltIn: 'desc' }, { useCount: 'desc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({
      templates: templates.map((t) => ({
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
      })),
    })
  })
}

// POST /api/templates -> create a template from { name, prompt, icon?, fields?, tags? }
export function POST(req: NextRequest) {
  return safeApi(async () => {
    const body = await req.json().catch(() => ({} as any))
    const v = validateBody(schemas.template, body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const { name, prompt, icon } = v.data
    const fields = Array.isArray(body?.fields) ? body.fields : []
    const tags = Array.isArray(body?.tags) ? body.tags.map(String) : []

    const created = await db.template.create({
      data: {
        name,
        prompt,
        icon: icon || null,
        fields: fields.length ? JSON.stringify(fields) : null,
        tags: tags.length ? JSON.stringify(tags) : null,
        isBuiltIn: false,
        useCount: 0,
      },
    })

    await logActivity({
      type: 'template_saved',
      message: `Template "${name}" saved`,
      meta: { templateId: created.id, name },
    })

    return NextResponse.json({
      template: {
        id: created.id,
        name: created.name,
        prompt: created.prompt,
        icon: created.icon,
        fields: safeArr(created.fields),
        tags: safeArr(created.tags),
        isBuiltIn: created.isBuiltIn,
        useCount: created.useCount,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    })
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
