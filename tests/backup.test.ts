// Backup envelope validation, exercised without a database.
//
// parseBackup is the only thing standing between a malformed or too-new file and
// a half-applied restore, so it gets tested directly. The database-backed half
// is covered end to end by the E2E audit instead of mocked here.

import { describe, expect, it } from 'bun:test'
import { parseBackup, BACKUP_VERSION, type Backup } from '../src/lib/backup'

function validBackup(overrides: Partial<Backup> = {}): Backup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: { tasks: 1, sources: 1, items: 1 },
    tasks: [
      {
        id: 'task_1',
        title: 'Task',
        prompt: 'a long enough prompt',
        status: 'completed',
        objective: null,
        fields: null,
        searchQueries: null,
        sourceStrategy: null,
        validationRules: null,
        tags: null,
        stats: null,
        schedule: null,
        pinned: false,
        trashedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sources: [],
        items: [],
      },
    ],
    ...overrides,
  }
}

describe('parseBackup', () => {
  it('accepts a well-formed backup', () => {
    const r = parseBackup(validBackup())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.backup.tasks).toHaveLength(1)
  })

  it.each([
    ['null', null],
    ['a string', 'not json'],
    ['an array', []],
    ['a number', 42],
  ])('rejects %s', (_label, input) => {
    const r = parseBackup(input)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/JSON object/)
  })

  it('rejects a backup with no version', () => {
    const r = parseBackup({ tasks: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/version/)
  })

  // The important refusal: a file from a newer build must not be half-applied.
  it('refuses a backup from a newer build instead of guessing', () => {
    const r = parseBackup(validBackup({ version: BACKUP_VERSION + 1 }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/newer than this build/)
      expect(r.error).toMatch(/Update the app/)
    }
  })

  it('rejects a backup with no tasks array', () => {
    const r = parseBackup({ version: BACKUP_VERSION })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/no tasks array/)
  })

  it('rejects a task missing its identity fields', () => {
    const bad = validBackup()
    bad.tasks[0] = { ...bad.tasks[0], prompt: undefined as unknown as string }
    const r = parseBackup(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/missing id, title or prompt/)
  })

  it('rejects a task whose sources are not an array', () => {
    const bad = validBackup()
    bad.tasks[0] = { ...bad.tasks[0], sources: 'nope' as unknown as [] }
    const r = parseBackup(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/malformed sources list/)
  })

  it('rejects a task whose items are not an array', () => {
    const bad = validBackup()
    bad.tasks[0] = { ...bad.tasks[0], items: { nope: true } as unknown as [] }
    const r = parseBackup(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/malformed items list/)
  })

  // A task from an older file may omit sources/items entirely; that is a
  // legitimate empty workspace entry, not corruption.
  it('allows a task with no sources or items arrays at all', () => {
    const b = validBackup()
    delete (b.tasks[0] as { sources?: unknown }).sources
    delete (b.tasks[0] as { items?: unknown }).items
    expect(parseBackup(b).ok).toBe(true)
  })

  it('accepts an empty workspace', () => {

    expect(parseBackup(validBackup({ tasks: [] })).ok).toBe(true)
  })
})