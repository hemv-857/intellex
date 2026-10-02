import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity, rateLimit } from '@/lib/api-utils'
import { extractFromSource, dedupeKeyFrom, type FieldDef, type WorkflowPlan } from '@/lib/ai'
import { randomUUID } from 'node:crypto'
import { claimRun, releaseRun, isRunActive } from '@/lib/run-lease'

// POST /api/sources/[id]/re-extract
//
// Re-runs extraction for a single source and replaces only the records that came
// from that source. The page may have been broken at collection time (empty HTML,
// a JS-rendered page, a bad extraction) and re-reading it is much cheaper than
// re-running the whole collection.

export const POST = rateLimit({ max: 15, key: 're-extract' })(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  const source = await db.dataSource.findUnique({
    where: { id },
    include: { task: { select: { id: true, title: true, status: true, fields: true, objective: true, prompt: true, tags: true, sourceStrategy: true, validationRules: true } } },
  })
  if (!source) return NextResponse.json({ error: 'Source not found' }, { status: 404 })
  // Lease-aware: a task left as 'running' with no live lease is not actually
  // running and must not block a re-extract.
  if (await isRunActive(source.taskId)) {
    return NextResponse.json({ error: 'Task is currently running — wait for it to finish.' }, { status: 409 })
  }

  // Re-extraction borrows the task's run lease so it cannot race a full run.
  // The prior status is restored on failure: releasing the lease alone would
  // leave the task reading "running" in the UI with nothing behind it.
  const previousStatus = source.task.status
  const token = randomUUID()
  const lease = await claimRun(source.taskId, token)
  if (!lease) {
    return NextResponse.json({ error: 'Task is already running — try again shortly.' }, { status: 409 })
  }

  try {
    const plan: WorkflowPlan = {
      title: source.task.title,
      objective: source.task.objective || source.task.prompt,
      fields: parseFields(source.task.fields),
      searchQueries: [],
      sourceStrategy: [],
      validationRules: parseArray(source.task.validationRules),
      tags: parseArray(source.task.tags),
    }

    const previous = await db.dataItem.count({ where: { sourceId: id } })

    const { records, tokens, title, pageReadOk } = await extractFromSource(plan, {
      url: source.url,
      title: source.title || '',
      snippet: source.snippet || '',
    })

    await db.dataSource.update({
      where: { id },
      data: {
        fetchStatus: pageReadOk ? 'fetched' : 'failed',
        fetchedAt: pageReadOk ? new Date() : null,
        tokensUsed: tokens,
        title: title || source.title,
        contentExcerpt: pageReadOk
          ? (records.length ? `Re-extracted ${records.length} record(s)` : 'Re-extracted: no records found')
          : 'Page read failed — extracted from search snippet only',
      },
    })

    // Replace this source's records only, and only when the page actually read.
    // A failed read must not destroy data that a previous good run produced.
    let written = 0
    if (pageReadOk) {
      await db.$transaction([db.dataItem.deleteMany({ where: { sourceId: id } })])
      const seen = new Set<string>()
      for (const record of records) {
        const key = dedupeKeyFrom(record, plan.fields)
        if (key && seen.has(key)) continue
        if (key) seen.add(key)

        const populated = plan.fields.filter((f) => {
          const v = record[f.name]
          return v !== undefined && v !== null && String(v).trim() !== ''
        }).length
        const confidence = plan.fields.length ? Math.round((populated / plan.fields.length) * 100) : 0
        const missingRequired = plan.fields
          .filter((f) => f.required)
          .some((f) => {
            const v = record[f.name]
            return v === undefined || v === null || String(v).trim() === ''
          })

        const payload = {
          sourceId: id,
          data: JSON.stringify(record),
          title: String(record[plan.fields[0]?.name] || title || 'Untitled').slice(0, 300),
          summary: plan.fields
            .slice(1, 4)
            .map((f) => {
              const v = record[f.name]
              return v ? `${f.name}: ${String(v).slice(0, 80)}` : null
            })
            .filter(Boolean)
            .join(' · ')
            .slice(0, 500),
          confidence,
          valid: !missingRequired,
        }

        if (key) {
          await db.dataItem.upsert({
            where: { taskId_dedupeKey: { taskId: source.taskId, dedupeKey: key } },
            create: { taskId: source.taskId, dedupeKey: key, ...payload },
            update: payload,
          })
        } else {
          await db.dataItem.create({ data: { taskId: source.taskId, dedupeKey: null, ...payload } })
        }
        written++
      }
    }

    const after = await db.dataItem.count({ where: { sourceId: id } })

    await logActivity({
      type: 'source_reextract',
      taskId: source.taskId,
      message: `Re-extracted source "${(title || source.title || source.url).slice(0, 80)}"`,
      meta: { sourceId: id, written, previous, tokens },
    })

    await db.task.update({ where: { id: source.taskId }, data: { status: previousStatus } })

    return NextResponse.json({
      ok: true,
      pageReadOk,
      records: written,
      previousRecords: previous,
      currentRecords: after,
      tokens,
      message: pageReadOk
        ? (written > 0 ? `Re-extracted ${written} record(s).` : 'Page read, but no records found.')
        : 'Could not read the page — existing records were left untouched.',
    })
  } catch (e) {
    // Put the task back the way we found it before surfacing the error.
    await db.task
      .update({ where: { id: source.taskId }, data: { status: previousStatus } })
      .catch(() => {})
    return NextResponse.json({ error: (e as Error).message || 'Re-extraction failed' }, { status: 500 })
  } finally {
    await releaseRun(source.taskId, token)
  }
})

function parseArray(s?: string | null): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function parseFields(s?: string | null): FieldDef[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? (v as FieldDef[]) : []
  } catch {
    return []
  }
}