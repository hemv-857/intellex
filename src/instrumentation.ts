// In-process scheduler driver.
//
// Scheduled collections used to fire from a setInterval in the browser, which
// meant (a) the scheduler secret had to be readable by any visitor via
// NEXT_PUBLIC_*, and (b) nothing ran unless a browser tab was open. The browser
// no longer holds the secret and no longer drives the schedule; this interval
// does, entirely server-side, using the same lib/scheduler.ts cycle as the
// authenticated /api/scheduler/tick endpoint.
//
// For a multi-instance deployment, disable this (IN_PROCESS_SCHEDULER=0) and let
// cron or launchd drive the HTTP endpoint instead, so only one instance ticks.

const TICK_INTERVAL_MS = 60_000
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.IN_PROCESS_SCHEDULER === '0') return

  // Respect the same switch as the HTTP endpoint: with no SCHEDULER_KEY the
  // operator has scheduling switched off, and starting up anyway would run
  // collections they believe are disabled.
  if (!process.env.SCHEDULER_KEY) return

  // Dev reloads re-run this module; one timer per process is plenty.
  const g = globalThis as { __intellexScheduler?: ReturnType<typeof setInterval> }
  if (g.__intellexScheduler) return

  let lastPurge = 0

  const cycle = async () => {
    try {
      const { schedulerCycle } = await import('@/lib/scheduler')
      const doPurge = Date.now() - lastPurge > PURGE_INTERVAL_MS
      const result = await schedulerCycle({ purge: doPurge })
      if (doPurge) lastPurge = Date.now()

      if (result.processed > 0 || result.reaped.length > 0 || result.purged > 0) {
        console.log(
          `[scheduler] processed=${result.processed} reaped=${result.reaped.length} purged=${result.purged}`,
        )
      }
    } catch (e) {
      // Never let a failed cycle kill the interval.
      console.error('[scheduler] cycle failed', e)
    }
  }

  g.__intellexScheduler = setInterval(cycle, TICK_INTERVAL_MS)
  // Do not hold the process open just for the scheduler.
  g.__intellexScheduler.unref?.()

  // Catch up shortly after boot so a restart does not wait a full minute.
  const initial = setTimeout(cycle, 5_000)
  initial.unref?.()
}