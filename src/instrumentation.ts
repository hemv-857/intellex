// Boot-time setup, run once per server process.
//
// Three jobs:
//   1. Materialise the Z.AI credentials file the SDK insists on reading, so the
//      app works where there is no home directory and no pre-existing config.
//   2. Start the in-process scheduler (only when SCHEDULER_KEY is set).
//   3. Install a graceful-shutdown hook so a deploy drains rather than cutting
//      a collection run off mid-write.

const TICK_INTERVAL_MS = 60_000
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours
const SHUTDOWN_GRACE_MS = 10_000

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // 1) Credentials
  try {
    const { ensureZaiConfig } = await import('@/lib/zai-config')
    const result = ensureZaiConfig()
    if (result.created) {
      console.log('[boot] wrote .z-ai-config from ZAI_API_KEY/ZAI_BASE_URL')
    } else if (result.reason && process.env.NODE_ENV === 'production') {
      console.warn(`[boot] LLM not configured: ${result.reason}. Collection runs will fail.`)
    }
  } catch (e) {
    console.error('[boot] could not prepare LLM config', e)
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

  // 3) Graceful shutdown
  if (!g.__intellexShutdownHandler) {
    g.__intellexShutdownHandler = true
    const shutdown = (signal: string) => {
      if (g.__intellexShutdown) return
      g.__intellexShutdown = true
      console.log(`[shutdown] ${signal} received — draining for ${SHUTDOWN_GRACE_MS}ms`)
      // Stop firing new work; let anything already queued finish writing.
      if (g.__intellexScheduler) clearInterval(g.__intellexScheduler)
      setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref?.()
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }
}