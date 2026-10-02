import type { Prisma } from '@prisma/client'

// Soft-delete was only honoured by 3 of the 11 places that read tasks, so a task
// moved to trash still appeared in search, datasets, insights, compare and most
// dashboard numbers. There is now exactly one definition of "a task the operator
// can see", and every read path composes it.

/** Tasks that are not in the trash. Compose with any other filter. */
export const notTrashed = { trashedAt: null } satisfies Prisma.TaskWhereInput

/** Completed and not trashed — the corpus that search/datasets/insights score. */
export const visibleCompleted = {
  status: 'completed',
  trashedAt: null,
} satisfies Prisma.TaskWhereInput

/** The ids of every task the operator can currently see. */
export async function visibleTaskIds(): Promise<string[]> {
  const { db } = await import('@/lib/db')
  const rows = await db.task.findMany({ where: notTrashed, select: { id: true } })
  return rows.map((r) => r.id)
}