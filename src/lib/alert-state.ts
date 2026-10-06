// Alert acknowledgement state.
//
// Split out of the route so the threshold logic can be tested directly. The
// decision is one line of date comparison but it is the entire definition of
// "still needs attention", so it is worth pinning: getting it wrong either hides
// a live failure or re-nags forever.

const SEEN_KEY = 'alertsSeenAt'

export function seenMs(prefs: Record<string, unknown>): number {
  const v = prefs[SEEN_KEY]
  if (typeof v !== 'string') return 0
  const ms = new Date(v).getTime()
  // A corrupt stored value must read as "nothing acknowledged" rather than
  // comparing against NaN and silently clearing or pinning every alert.
  return Number.isNaN(ms) ? 0 : ms
}

export function isUnacknowledged(
  runStatus: string,
  createdAtMs: number,
  prefs: Record<string, unknown>,
): boolean {
  if (runStatus !== 'failed') return false
  const seen = seenMs(prefs)
  return !seen || createdAtMs > seen
}