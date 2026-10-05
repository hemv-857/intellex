// SIGTERM/SIGINT drain for platforms that stop a process on deploy (Render,
// Fly, Railway). Lives in its own module and is imported DYNAMICALLY from
// instrumentation.ts so that `process.exit` never ends up in the edge bundle —
// Next bundles instrumentation for both runtimes and warns about Node APIs it
// cannot use there.

const SHUTDOWN_GRACE_MS = 10_000

type SchedulerGlobals = {
  __intellexScheduler?: ReturnType<typeof setInterval>
  __intellexShutdown?: boolean
  __intellexShutdownHandler?: boolean
}

export function installShutdownHandler(g: SchedulerGlobals): void {
  if (g.__intellexShutdownHandler) return
  g.__intellexShutdownHandler = true

  const shutdown = (signal: string) => {
    if (g.__intellexShutdown) return
    g.__intellexShutdown = true
    // Stop firing new work; anything already queued gets a grace period to finish
    // writing before the process exits.
    if (g.__intellexScheduler) clearInterval(g.__intellexScheduler)
    console.log(`[shutdown] ${signal} received — draining for ${SHUTDOWN_GRACE_MS}ms`)
    const t = setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS)
    t.unref?.()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}