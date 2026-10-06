// Whole-workspace backup and restore.
//
// Why this exists: on the free Render plan there is no persistent disk, so the
// SQLite file is wiped on every deploy. Every collected dataset disappears with
// it. A backup that only captures one task at a time would still lose the
// workspace, so this captures everything in one document.
//
// Format is versioned from the start. A restore must be able to tell a file
// written by an older build from one written by a newer one, and refuse the
// mismatch rather than half-import it.

import { db } from '@/lib/db'

/** Bump when the shape below changes in a way a restore must notice. */
export const BACKUP_VERSION = 1

export interface BackupSource {
  id: string
  url: string
  title: string | null
  snippet: string | null
  hostName: string | null
  favicon: string | null
  publishedTime: string | null
  rank: number
  contentExcerpt: string | null
  fetchStatus: string
  tokensUsed: number
  fetchedAt: string | null
}

export interface BackupItem {
  id: string
  title: string | null
  summary: string | null
  confidence: number
  valid: boolean
  data: Record<string, unknown>
  dedupeKey: string | null
  /** Present so a restore can remap the record's source after re-creating rows. */
  sourceId: string | null
  contentDate: string | null
  createdAt: string
}

export interface BackupTask {
  id: string
  title: string
  prompt: string
  status: string
  objective: string | null
  fields: string | null
  searchQueries: string | null
  sourceStrategy: string | null
  validationRules: string | null
  tags: string | null
  stats: string | null
  schedule: string | null
  pinned: boolean
  trashedAt: string | null
  createdAt: string
  updatedAt: string
  sources: BackupSource[]
  items: BackupItem[]
}

export interface Backup {
  version: number
  exportedAt: string
  counts: { tasks: number; sources: number; items: number }
  tasks: BackupTask[]
}

export async function buildBackup(): Promise<Backup> {
  const tasks = await db.task.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      sources: { orderBy: { rank: 'asc' } },
      dataItems: { orderBy: { createdAt: 'asc' } },
    },
  })

  const json = (raw: string | null): Record<string, unknown> => {
    if (!raw) return {}
    try {
      const v = JSON.parse(raw)
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
    } catch {
      return {}
    }
  }

  const out: BackupTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    prompt: t.prompt,
    status: t.status,
    objective: t.objective,
    fields: t.fields,
    searchQueries: t.searchQueries,
    sourceStrategy: t.sourceStrategy,
    validationRules: t.validationRules,
    tags: t.tags,
    stats: t.stats,
    schedule: t.schedule,
    pinned: t.pinned,
    trashedAt: t.trashedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    sources: t.sources.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title,
      snippet: s.snippet,
      hostName: s.hostName,
      favicon: s.favicon,
      publishedTime: s.publishedTime,
      rank: s.rank,
      contentExcerpt: s.contentExcerpt,
      fetchStatus: s.fetchStatus,
      tokensUsed: s.tokensUsed,
      fetchedAt: s.fetchedAt?.toISOString() ?? null,
    })),
    items: t.dataItems.map((it) => ({
      id: it.id,
      title: it.title,
      summary: it.summary,
      confidence: it.confidence,
      valid: it.valid,
      data: json(it.data),
      dedupeKey: it.dedupeKey,
      sourceId: it.sourceId,
      contentDate: it.contentDate?.toISOString() ?? null,
      createdAt: it.createdAt.toISOString(),
    })),
  }))

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      tasks: out.length,
      sources: out.reduce((n, t) => n + t.sources.length, 0),
      items: out.reduce((n, t) => n + t.items.length, 0),
    },
    tasks: out,
  }
}

export interface RestoreReport {
  ok: boolean
  error?: string
  tasksCreated: number
  tasksSkipped: number
  sourcesCreated: number
  itemsCreated: number
  /** Child rows dropped because their id was already taken by another task. */
  sourcesSkipped: number
  itemsSkipped: number
}

/**
 * Validates the envelope before touching the database. A partial restore is
 * worse than a refused one, so every shape check happens up front.
 */
export function parseBackup(raw: unknown): { ok: true; backup: Backup } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Backup must be a JSON object' }
  }
  const b = raw as Partial<Backup>
  if (typeof b.version !== 'number') return { ok: false, error: 'Backup is missing a version' }
  if (b.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: `Backup version ${b.version} is newer than this build supports (${BACKUP_VERSION}). Update the app before restoring.`,
    }
  }
  if (!Array.isArray(b.tasks)) return { ok: false, error: 'Backup has no tasks array' }

  for (const t of b.tasks) {
    if (!t || typeof t !== 'object') return { ok: false, error: 'Backup contains a non-object task' }
    const task = t as Partial<BackupTask>
    if (!task.id || typeof task.title !== 'string' || typeof task.prompt !== 'string') {
      return { ok: false, error: 'A task is missing id, title or prompt' }
    }
    if (task.sources !== undefined && !Array.isArray(task.sources)) {
      return { ok: false, error: `Task "${task.title}" has a malformed sources list` }
    }
    if (task.items !== undefined && !Array.isArray(task.items)) {
      return { ok: false, error: `Task "${task.title}" has a malformed items list` }
    }
  }

  return { ok: true, backup: b as Backup }
}

/**
 * Restores, keyed on task id so re-importing the same backup twice is a no-op
 * rather than a duplicate workspace. Child rows keep their own ids and the
 * foreign key is remapped, so records survive a move between databases.
 */
export async function restoreBackup(backup: Backup): Promise<RestoreReport> {
  const report: RestoreReport = {
    ok: true,
    tasksCreated: 0,
    tasksSkipped: 0,
    sourcesCreated: 0,
    itemsCreated: 0,
    sourcesSkipped: 0,
    itemsSkipped: 0,
  }

  for (const t of backup.tasks) {
    const existing = await db.task.findUnique({ where: { id: t.id }, select: { id: true } })
    if (existing) {
      report.tasksSkipped++
      continue
    }

    const sourceIdMap = new Map<string, string>()
    await db.task.create({
      data: {
        id: t.id,
        title: t.title,
        prompt: t.prompt,
        status: t.status || 'planned',
        objective: t.objective ?? null,
        fields: t.fields ?? null,
        searchQueries: t.searchQueries ?? null,
        sourceStrategy: t.sourceStrategy ?? null,
        validationRules: t.validationRules ?? null,
        tags: t.tags ?? null,
        stats: t.stats ?? null,
        schedule: t.schedule ?? null,
        pinned: !!t.pinned,
        trashedAt: t.trashedAt ? new Date(t.trashedAt) : null,
        createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
        updatedAt: t.updatedAt ? new Date(t.updatedAt) : new Date(),
      },
    })
    report.tasksCreated++

    for (const s of t.sources ?? []) {
      if (!s?.url) continue
      try {
        const row = await db.dataSource.create({
          data: {
            id: s.id,
            taskId: t.id,
            url: s.url,
            title: s.title ?? null,
            snippet: s.snippet ?? null,
            hostName: s.hostName ?? null,
            favicon: s.favicon ?? null,
            publishedTime: s.publishedTime ?? null,
            rank: s.rank ?? 0,
            contentExcerpt: s.contentExcerpt ?? null,
            fetchStatus: s.fetchStatus || 'fetched',
            tokensUsed: s.tokensUsed ?? 0,
            fetchedAt: s.fetchedAt ? new Date(s.fetchedAt) : null,
          },
        })
        sourceIdMap.set(s.id, row.id)
        report.sourcesCreated++
      } catch {
        // The id is taken by a source belonging to another task. That row is
        // already in the workspace, so skip rather than abort the restore.
        report.sourcesSkipped++
      }
    }

    for (const it of t.items ?? []) {
      // Records can arrive with a dedupeKey that already exists within the task
      // (the unique constraint is (taskId, dedupeKey)), so fall back to create
      // without the key rather than aborting the whole restore.
      const data = JSON.stringify(it.data ?? {})
      const base = {
        taskId: t.id,
        title: it.title ?? null,
        summary: it.summary ?? null,
        confidence: it.confidence ?? 0,
        valid: it.valid !== false,
        data,
        contentDate: it.contentDate ? new Date(it.contentDate) : null,
        createdAt: it.createdAt ? new Date(it.createdAt) : new Date(),
      }
      // A record pointing at a source that failed to restore would violate the
      // foreign key, so an unmapped id degrades to null rather than throwing.
      const mappedSid = it.sourceId ? sourceIdMap.get(it.sourceId) ?? null : null

      // Three ways a create can fail, all of which should degrade rather than
      // abort: the id is taken, or (taskId, dedupeKey) already exists within
      // this task. Retrying without the id still lets a legitimate record land.
      let written = false
      for (const attempt of [
        { id: it.id, dedupeKey: it.dedupeKey },
        { id: undefined, dedupeKey: it.dedupeKey },
        { id: undefined, dedupeKey: null },
      ]) {
        try {
          await db.dataItem.create({ data: { ...base, ...attempt, sourceId: mappedSid } })
          written = true
          break
        } catch {
          // try the next shape
        }
      }
      if (written) report.itemsCreated++
      else report.itemsSkipped++
    }
  }

  return report
}