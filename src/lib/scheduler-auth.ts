import { timingSafeEqual } from 'node:crypto'

// The scheduler endpoints are the only mutating routes that do not authenticate a
// user, so they fail closed: with no SCHEDULER_KEY configured they are disabled
// rather than open on a well-known default.

export function isSchedulerDisabled(): boolean {
  return !process.env.SCHEDULER_KEY
}

export function schedulerKeyMatches(provided: string | null | undefined): boolean {
  const expected = process.env.SCHEDULER_KEY
  if (!expected || provided == null) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}