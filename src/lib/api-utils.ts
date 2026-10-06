import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// In-memory rate limiter (per IP, per window)
// ---------------------------------------------------------------------------

interface RateBucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateBucket>()
const WINDOW_MS = 60_000 // 1 minute

interface RateLimitOptions {
  max: number       // max requests per window
  windowMs?: number
  key?: string      // optional extra key (e.g. route name)
}

export function rateLimit(opts: RateLimitOptions) {
  return (handler: (req: NextRequest, ctx: any) => Promise<Response>) => {
    return async (req: NextRequest, ctx: any): Promise<Response> => {
      const ip = getClientIp(req)
      const k = `${ip}:${opts.key || 'default'}`
      const now = Date.now()
      const windowMs = opts.windowMs || WINDOW_MS
      const bucket = buckets.get(k)
      if (!bucket || now > bucket.resetAt) {
        buckets.set(k, { count: 1, resetAt: now + windowMs })
      } else {
        bucket.count++
        if (bucket.count > opts.max) {
          const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
          return NextResponse.json(
            { error: 'Too many requests. Please slow down.', retryAfter },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
          )
        }
      }
      return handler(req, ctx)
    }
  }
}

// Only trust forwarding headers when a proxy is actually in front of us. Without
// this, any client can send its own x-forwarded-for and mint a fresh rate-limit
// bucket per request. Set TRUST_PROXY=1 when deploying behind Caddy/nginx.
function getClientIp(req: NextRequest): string {
  const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true'
  if (trustProxy) {
    const xff = req.headers.get('x-forwarded-for')
    if (xff) return xff.split(',')[0].trim()
    const xri = req.headers.get('x-real-ip')
    if (xri) return xri
  }
  return 'anonymous'
}

// Periodic cleanup (prevent memory growth)
setInterval(() => {
  const now = Date.now()
  for (const [k, b] of buckets) {
    if (now > b.resetAt) buckets.delete(k)
  }
}, 5 * 60 * 1000).unref?.()

// ---------------------------------------------------------------------------
// Zod-based input validation helper
// ---------------------------------------------------------------------------

import { z } from 'zod'

export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(body)
  if (result.success) return { ok: true, data: result.data }
  const first = result.error.issues[0]
  return { ok: false, error: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input' }
}

// Common schemas
export const schemas = {
  createTask: z.object({
    prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(2000, 'Prompt too long (max 2000 chars)'),
  }),
  runTask: z
    .object({
      // 'incremental' keeps existing records and only pays for sources it has
      // not read before. 'replace' is the historical clear-and-rebuild.
      mode: z.enum(['replace', 'incremental']).optional().default('replace'),
    })
    .optional(),
  // Exactly one action per PATCH. Previously body.purge / body.restore / body.pinned
  // were trusted by truthiness on an untyped object, so any truthy value — including
  // "false" as a string or an array — could trigger a permanent delete.
  taskPatch: z
    .object({
      pinned: z.boolean().optional(),
      restore: z.boolean().optional(),
      purge: z.boolean().optional(),
    })
    .refine((v) => Object.values(v).some((x) => x === true), {
      message: 'Provide one of pinned, restore or purge set to true',
    }),
  bulkTasks: z.object({
    ids: z.array(z.string().min(1)).min(1).max(500),
    action: z.enum(['delete', 'purge', 'restore', 'pin', 'unpin', 'duplicate']),
  }),
  search: z.object({
    q: z.string().min(1).max(500),
    limit: z.number().int().min(1).max(500).optional().default(100),
    sort: z.enum(['relevance', 'latest']).optional().default('relevance'),
    dateRange: z.enum(['any', '7d', '30d', '90d', '365d']).optional().default('any'),
  }),
  schedule: z.object({
    enabled: z.boolean(),
    intervalMinutes: z.number().int().min(15).max(10080).optional(), // 15 min to 7 days
  }),
  template: z.object({
    name: z.string().min(2).max(80),
    prompt: z.string().min(10).max(2000),
    icon: z.string().max(10).optional(),
  }),
  shareCreate: z.object({
    label: z.string().max(120).optional(),
    ttlDays: z.number().int().min(0).max(365).optional(), // 0 = never expires
  }),
  preferences: z.object({
    defaultSort: z.enum(['relevance', 'latest']).optional(),
    defaultDateRange: z.enum(['any', '7d', '30d', '90d', '365d']).optional(),
    semanticByDefault: z.boolean().optional(),
    exportFormat: z.enum(['csv', 'json', 'xlsx']).optional(),
    autoSchedule: z.boolean().optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
  }),
}

// ---------------------------------------------------------------------------
// Activity logger
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'

export async function logActivity(params: {
  type: string
  taskId?: string
  message: string
  meta?: Record<string, unknown>
}) {
  try {
    await db.activityLog.create({
      data: {
        type: params.type,
        taskId: params.taskId || null,
        message: params.message,
        meta: params.meta ? JSON.stringify(params.meta) : null,
      },
    })
  } catch (e) {
    // never let logging break the request
    console.error('activity log failed', e)
  }
}

// ---------------------------------------------------------------------------
// Safe API wrapper — catches errors, returns JSON
// ---------------------------------------------------------------------------

export function safeApi<T>(handler: () => Promise<T>): Promise<Response> {
  return handler()
    .then((data) => {
      if (data instanceof Response) return data
      return NextResponse.json(data)
    })
    .catch((e) => {
      console.error('API error', e)
      const msg = e?.message || 'Internal server error'
      const status = msg.includes('not found') ? 404 : msg.includes('required') || msg.includes('Invalid') ? 400 : 500
      return NextResponse.json({ error: msg }, { status })
    })
}
