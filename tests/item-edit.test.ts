import { describe, expect, it } from 'bun:test'
import { schemas, validateBody } from '../src/lib/api-utils'

// The record-edit PATCH schema.
//
// This is the same shape of hazard as the old taskPatch bug, where truthiness on
// an untyped body let body.purge = "false" trigger a permanent delete. The schema
// is the boundary, so it is tested directly.

describe('itemPatch schema', () => {
  it('accepts a fields edit', () => {
    const r = validateBody(schemas.itemPatch, { fields: { name: 'Acme' } })
    expect(r.ok).toBe(true)
  })

  it('accepts the valid toggle as a boolean', () => {
    expect(validateBody(schemas.itemPatch, { valid: false }).ok).toBe(true)
    expect(validateBody(schemas.itemPatch, { valid: true }).ok).toBe(true)
  })

  // The old failure mode: a string "false" is truthy. Reject non-booleans so a
  // toggle can never be driven by an unvalidated truthy value.
  it('rejects a non-boolean valid', () => {
    for (const bad of ['false', 'true', 1, 0, null, {}]) {
      expect(validateBody(schemas.itemPatch, { valid: bad }).ok).toBe(false)
    }
  })

  it('accepts delete only as the literal true', () => {
    expect(validateBody(schemas.itemPatch, { delete: true }).ok).toBe(true)
    for (const bad of ['true', 1, false, null]) {
      expect(validateBody(schemas.itemPatch, { delete: bad }).ok).toBe(false)
    }
  })

  it('requires exactly one action', () => {
    const r = validateBody(schemas.itemPatch, { fields: { a: 'x' }, valid: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/exactly one/)
  })

  it('rejects an empty action set', () => {
    const r = validateBody(schemas.itemPatch, {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/exactly one/)
  })

  it('rejects an empty fields object rather than silently doing nothing', () => {
    const r = validateBody(schemas.itemPatch, { fields: {} })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/at least one field/)
  })

  it('rejects a field list nested one level too deep', () => {
    // record() would accept an object value; the value union forbids it so a
    // nested structure cannot be smuggled into the stored JSON blob.
    const r = validateBody(schemas.itemPatch, { fields: { meta: { nested: true } } })
    expect(r.ok).toBe(false)
  })

  it('allows numbers, booleans and null as field values', () => {
    for (const v of [42, true, null]) {
      expect(validateBody(schemas.itemPatch, { fields: { amount: v } }).ok).toBe(true)
    }
  })

  it('bounds both the field name and its value', () => {
    // Key limit is 200, value limit is 4000. Verified against zod 4.3.5:
    // z.record(z.string().max(n), ...) does enforce the key bound.
    expect(validateBody(schemas.itemPatch, { fields: { ['k'.repeat(201)]: 'v' } }).ok).toBe(false)
    expect(validateBody(schemas.itemPatch, { fields: { ['k'.repeat(200)]: 'v' } }).ok).toBe(true)
    expect(validateBody(schemas.itemPatch, { fields: { bio: 'x'.repeat(4001) } }).ok).toBe(false)
    expect(validateBody(schemas.itemPatch, { fields: { bio: 'x'.repeat(4000) } }).ok).toBe(true)
  })
})