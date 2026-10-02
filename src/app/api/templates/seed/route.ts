import { NextRequest, NextResponse } from 'next/server'
import { logActivity, rateLimit, safeApi } from '@/lib/api-utils'
import { ensureBuiltInTemplates } from '../route'

// POST /api/templates/seed -> idempotently seed built-in templates if none exist
export const POST = rateLimit({ max: 5, key: 'template-seed' })(function POST(_req: NextRequest) {
  return safeApi(async () => {
    const result = await ensureBuiltInTemplates()
    await logActivity({
      type: 'template_saved',
      message: `Seeded ${result.seeded} built-in template(s)`,
      meta: { seeded: result.seeded, total: result.total, source: 'seed_endpoint' },
    })
    return NextResponse.json({ ok: true, ...result })
  })
})
