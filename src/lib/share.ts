import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'

// Share links hand out read-only access to one task's dataset.
//
// The token is 32 random bytes shown to the operator exactly once and stored
// only as a SHA-256 hash, so a database leak cannot be turned into working share
// URLs. Verification is timing-safe. Everything is revocable and can expire.

const TOKEN_BYTES = 32
export const DEFAULT_SHARE_TTL_DAYS = 30

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function generateShareToken(): string {
  // base64url so the token is URL-safe without escaping
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function tokensMatch(candidate: string, storedHash: string): boolean {
  const a = Buffer.from(hashShareToken(candidate), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type ShareState = 'active' | 'revoked' | 'expired' | 'unknown'

export function shareState(
  link: { revokedAt: Date | null; expiresAt: Date | null },
  now = new Date(),
): ShareState {
  if (link.revokedAt) return 'revoked'
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return 'expired'
  return 'active'
}

export async function createShare(args: { taskId: string; label?: string; ttlDays?: number }) {
  const ttl = args.ttlDays ?? DEFAULT_SHARE_TTL_DAYS
  const token = generateShareToken()
  const expiresAt = ttl > 0 ? new Date(Date.now() + ttl * 86_400_000) : null

  const link = await db.shareLink.create({
    data: {
      taskId: args.taskId,
      label: args.label?.slice(0, 120) || null,
      tokenHash: hashShareToken(token),
      expiresAt,
    },
  })

  return { id: link.id, token, expiresAt: link.expiresAt, label: link.label }
}

/**
 * Resolves a raw token to its task, or null. Only a completed, non-trashed task
 * is shareable — a half-finished or trashed collection has no dataset worth
 * exposing, and this stops a link outliving the task being deleted.
 */
export async function resolveShare(token: string) {
  if (!token || token.length < 20 || token.length > 200) return null

  const links = await db.shareLink.findMany({
    where: { tokenHash: hashShareToken(token) },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          objective: true,
          fields: true,
          tags: true,
          status: true,
          trashedAt: true,
          stats: true,
          completedAt: true,
        },
      },
    },
  })

  for (const link of links) {
    if (!tokensMatch(token, link.tokenHash)) continue
    if (shareState(link) !== 'active') return { state: shareState(link) as ShareState, link: null }
    if (link.task.status !== 'completed' || link.task.trashedAt) {
      return { state: 'unknown' as ShareState, link: null }
    }
    return { state: 'active' as ShareState, link }
  }
  return null
}