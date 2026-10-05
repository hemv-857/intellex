// Boot-time setup, run once per server process.
//
// Two jobs:
//   1. Start the in-process scheduler (only when SCHEDULER_KEY is set).
//   2. Install a graceful-shutdown hook so a deploy drains rather than cutting
//      a collection run off mid-write.
//
// The old third job — writing a Z.AI credentials file — is gone. Credentials now
// go straight from the environment to the provider clients, so there is no file
// to materialise.

const TICK_INTERVAL_MS = 60_000
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // 1) Warn early if the providers are not configured. Collections fail
  // per-request with a clear message either way; this just makes a silent
  // misconfiguration visible in the deploy logs at boot instead.
  if (process.env.NODE_ENV === 'production') {
    const missing = [
      ['OPENROUTER_API_KEY', 'chat'],
      ['TAVILY_API_KEY', 'web search'],
    ]
      .filter(([key]) => !process.env[key])
      .map(([, what]) => what)
    if (missing.length) {
      console.warn(
        `[boot] provider not configured: missing key for ${missing.join(', ')}. Those flows will fail.`,
      )
    }
  }

  // 2) Scheduler
  const g = globalThis as {
    __intellexScheduler?: ReturnType<typeof setInterval>
    __intellexShutdown?: boolean
    __intellexShutdownHandler?: boolean
  }
  g.__intellexShutdown = false

  // Respect the same switch as the HTTP endpoint: with no SCHEDULER_KEY the
  // operator has scheduling off, and starting anyway would run collections they
  // believe are disabled.
  const inProcess = process.env.IN_PROCESS_SCHEDULER !== '0'
  if (inProcess && process.env.SCHEDULER_KEY && !g.__intellexScheduler) {
    let lastPurge = 0

    const cycle = async () => {
      if (g.__intellexShutdown) return
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
    g.__intellexScheduler.unref?.()
    // Catch up shortly after boot so a restart does not wait a full minute.
    setTimeout(cycle, 5_000).unref?.()
    console.log('[boot] in-process scheduler started (60s interval)')
  }

  // 3) Graceful shutdown. Imported dynamically so process.exit stays out of the
  // edge bundle Next also builds for instrumentation.
  const { installShutdownHandler } = await import('@/lib/shutdown')
  installShutdownHandler(g)
}