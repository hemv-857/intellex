import { describe, expect, it } from 'bun:test'
import { isUnacknowledged, seenMs } from '../src/lib/alert-state'

// This decides whether a failed scheduled run is still demanding attention.
// Getting it wrong either hides a live failure or re-nags about an old one, so
// the boundary cases are pinned rather than left to the route test.

describe('alert acknowledgement', () => {
  it('flags a failure when nothing has ever been acknowledged', () => {
    expect(isUnacknowledged('failed', Date.now(), {})).toBe(true)
  })

  it('flags a failure newer than the last acknowledgement', () => {
    const prefs = { alertsSeenAt: new Date(Date.now() - 60_000).toISOString() }
    expect(isUnacknowledged('failed', Date.now(), prefs)).toBe(true)
  })

  it('clears a failure older than the last acknowledgement', () => {
    const prefs = { alertsSeenAt: new Date(Date.now() + 60_000).toISOString() }
    expect(isUnacknowledged('failed', Date.now(), prefs)).toBe(false)
  })

  it('treats a run exactly at the acknowledgement instant as seen', () => {
    const at = new Date(1_700_000_000_000).toISOString()
    expect(isUnacknowledged('failed', 1_700_000_000_000, { alertsSeenAt: at })).toBe(false)
  })

  it('never flags a successful run, however old', () => {
    const prefs = { alertsSeenAt: new Date(Date.now() + 60_000).toISOString() }
    expect(isUnacknowledged('completed', Date.now(), prefs)).toBe(false)
    expect(isUnacknowledged('completed', 0, {})).toBe(false)
  })

  it('treats a corrupt timestamp as nothing acknowledged', () => {
    expect(seenMs({ alertsSeenAt: 'not-a-date' })).toBe(0)
    expect(seenMs({ alertsSeenAt: 12345 })).toBe(0)
    expect(seenMs({ alertsSeenAt: null })).toBe(0)
    expect(isUnacknowledged('failed', Date.now(), { alertsSeenAt: 'not-a-date' })).toBe(true)
  })

  it('reads a valid timestamp', () => {
    expect(seenMs({ alertsSeenAt: '2026-01-01T00:00:00.000Z' })).toBe(Date.parse('2026-01-01T00:00:00.000Z'))
  })
})
