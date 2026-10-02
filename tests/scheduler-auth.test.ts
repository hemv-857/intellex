/// <reference types="bun-types" />
import { afterEach, describe, expect, test } from 'bun:test'
import { isSchedulerDisabled, schedulerKeyMatches } from '../src/lib/scheduler-auth'

const original = process.env.SCHEDULER_KEY

afterEach(() => {
  if (original === undefined) delete process.env.SCHEDULER_KEY
  else process.env.SCHEDULER_KEY = original
})

describe('scheduler auth', () => {
  test('is disabled when SCHEDULER_KEY is unset, and never matches', () => {
    delete process.env.SCHEDULER_KEY
    expect(isSchedulerDisabled()).toBe(true)
    expect(schedulerKeyMatches('anything')).toBe(false)
    expect(schedulerKeyMatches('')).toBe(false)
    expect(schedulerKeyMatches(null)).toBe(false)
  })

  test('rejects the old public default when a real key is configured', () => {
    process.env.SCHEDULER_KEY = 'a-real-secret'
    expect(schedulerKeyMatches('intellex-dev')).toBe(false)
  })

  test('accepts only the exact key', () => {
    process.env.SCHEDULER_KEY = 'a-real-secret'
    expect(isSchedulerDisabled()).toBe(false)
    expect(schedulerKeyMatches('a-real-secret')).toBe(true)
    expect(schedulerKeyMatches('a-real-secre')).toBe(false) // length mismatch
    expect(schedulerKeyMatches('a-real-secret-x')).toBe(false) // prefix
    expect(schedulerKeyMatches(undefined)).toBe(false)
  })
})