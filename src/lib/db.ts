import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient() {
  const client = new PrismaClient({
    log: ['warn', 'error'],
  })

  // SQLite tuning that matters once there is real concurrent activity: WAL so
  // readers do not block the writer (the dashboard polls while a run writes),
  // and a busy timeout so a contended write waits instead of failing outright.
  // Both are no-ops on other providers.
  const url = process.env.DATABASE_URL || ''
  if (url.startsWith('file:')) {
    const configure = async () => {
      try {
        // These must go through $queryRaw: PRAGMA journal_mode returns a row
        // ("wal"), and $executeRawUnsafe rejects any statement that produces
        // results — which it did, silently leaving the database in rollback-journal
        // mode with readers blocking the writer.
        const applied = await client.$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode=WAL')
        await client.$queryRawUnsafe('PRAGMA busy_timeout=5000')
        await client.$queryRawUnsafe('PRAGMA synchronous=NORMAL')
        if (process.env.NODE_ENV === 'production') {
          console.log(`[db] sqlite journal_mode=${applied?.[0]?.journal_mode ?? 'unknown'}`)
        }
      } catch (e) {
        console.warn('[db] could not apply SQLite pragmas', e)
      }
    }
    void configure()
  }

  return client
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db