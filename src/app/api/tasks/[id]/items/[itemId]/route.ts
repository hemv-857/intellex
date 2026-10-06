import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dedupeKeyFrom, type FieldDef } from '@/lib/ai'
import { logActivity, schemas, validateBody } from '@/lib/api-utils'

// PATCH /api/tasks/[id]/items/[itemId]
//
// Lets a human correct a bad extraction. Until this existed the only remedy was
// deleting the source and re-running, which costs a Tavily credit and an
// extraction call per page, and can just reproduce the same mistake.
//
// Exactly one action per request, and the action is an enum rather than a
// truthiness check — the same class of bug that made taskPatch able to trigger a
// permanent delete from body.purge = "false".

function safeObj(s?: string | null): Record<string, unknown> {
  if (!s) return {}
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

function safeArr(s?: string | null): any[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  // The task param is `id`, matching every sibling route under /api/tasks/.
  // Next rejects a different slug name at the same segment level.
  const { id: taskId, itemId } = await params

  const raw = await req.json().catch(() => ({} as any))
  const parsed = validateBody(schemas.itemPatch, raw)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const body = parsed.data

  const item = await db.dataItem.findUnique({
    where: { id: itemId },
    select: { id: true, taskId: true, title: true, data: true, valid: true, dedupeKey: true },
  })
  // Scoped check: an item id must belong to the task in the path, or the route
  // would let anyone edit any record by guessing an id.
  if (!item || item.taskId !== taskId) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  // ---- valid / invalid toggle -------------------------------------------
  if (typeof body.valid === 'boolean') {
    await db.dataItem.update({ where: { id: itemId }, data: { valid: body.valid } })
    await logActivity({
      type: 'item_validity',
      taskId,
      message: `${body.valid ? 'Marked valid' : 'Marked invalid'}: "${item.title || itemId}"`,
      meta: { itemId, valid: body.valid, title: item.title },
    })
    return NextResponse.json({ ok: true, id: itemId, valid: body.valid })
  }

  // ---- delete a single record -------------------------------------------
  if (body.delete === true) {
    await db.dataItem.delete({ where: { id: itemId } })
    await logActivity({
      type: 'item_deleted',
      taskId,
      message: `Deleted record "${item.title || itemId}"`,
      meta: { itemId, title: item.title },
    })
    return NextResponse.json({ ok: true, id: itemId, deleted: true })
  }

  // ---- edit field values --------------------------------------------------
  if (body.fields && typeof body.fields === 'object') {
    const task = await db.task.findUnique({
      where: { id: taskId },
      select: { id: true, fields: true },
    })
    const schema: FieldDef[] = safeArr(task?.fields)
    const current = safeObj(item.data)
    const next = { ...current, ...body.fields }

    // Only fields the task actually declares may be written. Otherwise this
    // endpoint becomes an arbitrary-key write into the stored JSON blob.
    const allowed = new Set(schema.map((f) => f.name))
    const rejected = Object.keys(body.fields).filter((k) => !allowed.has(k))
    if (rejected.length > 0) {
      return NextResponse.json(
        { error: `Unknown field(s) for this task: ${rejected.join(', ')}` },
        { status: 400 },
      )
    }
    if (Object.keys(body.fields).length === 0) {
      return NextResponse.json({ error: 'No fields supplied' }, { status: 400 })
    }

    // Recompute the two derived columns rather than letting them drift from the
    // edited data: title follows the first field, and validity is the same
    // required-field check the collector applies.
    const populated = schema.filter((f) => {
      const v = next[f.name]
      return v !== undefined && v !== null && String(v).trim() !== ''
    }).length
    const missingRequired = schema.filter((f) => f.required).some((f) => {
      const v = next[f.name]
      return v === undefined || v === null || String(v).trim() === ''
    })
    const confidence = schema.length ? Math.round((populated / schema.length) * 100) : 0
    const title = String(next[schema[0]?.name] || item.title || 'Untitled').slice(0, 300)
    const summary = schema
      .slice(1, 4)
      .map((f) => {
        const v = next[f.name]
        return v ? `${f.name}: ${String(v).slice(0, 80)}` : null
      })
      .filter(Boolean)
      .join(' · ')
      .slice(0, 500)

    // A hand-edited record must not keep a dedupe key derived from values that
    // no longer exist, or a later incremental run would treat the edited copy as
    // the stored one and silently keep the stale original.
    const key = dedupeKeyFrom(next, schema)

    await db.dataItem.update({
      where: { id: itemId },
      data: {
        data: JSON.stringify(next),
        title,
        summary,
        confidence,
        valid: !missingRequired,
        dedupeKey: key || null,
      },
    })

    await logActivity({
      type: 'item_edited',
      taskId,
      message: `Edited record "${title}"`,
      meta: { itemId, title, fields: Object.keys(body.fields) },
    })

    return NextResponse.json({
      ok: true,
      id: itemId,
      data: next,
      title,
      confidence,
      valid: !missingRequired,
      dedupeKey: key || null,
    })
  }

  return NextResponse.json(
    { error: 'No valid action (fields | valid | delete)' },
    { status: 400 },
  )
}