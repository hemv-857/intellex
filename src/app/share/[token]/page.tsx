import Link from 'next/link'

// Read-only view of one shared dataset. Deliberately standalone: no sidebar, no
// app state, no authenticated fetches — it renders whatever /api/public/share
// returns for the token in the URL and nothing else.

export default async function SharedDatasetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  let data: any = null
  let error: string | null = null
  try {
    const res = await fetch(`${base}/api/public/share/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) error = body?.error || 'This link is not available.'
    else data = body
  } catch {
    error = 'Could not load this dataset.'
  }

  if (error || !data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <div className="mx-auto h-11 w-11 rounded-xl bg-muted flex items-center justify-center text-lg">🔒</div>
          <h1 className="text-lg font-semibold">Link unavailable</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link href="/" className="inline-block text-sm text-emerald-600 hover:underline">Go to Intellex</Link>
        </div>
      </main>
    )
  }

  const fields: Array<{ name?: string; label?: string }> = Array.isArray(data.task.fields) ? data.task.fields : []
  const records = Array.isArray(data.records) ? data.records : []
  const stats = data.task.stats || {}

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="font-semibold text-emerald-600">Intellex</span>
            <span>· shared dataset · read-only</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">{data.task.title}</h1>
          {data.task.objective && <p className="mt-1 text-sm text-muted-foreground">{data.task.objective}</p>}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{data.task.recordCount}</strong> records</span>
            <span><strong className="text-foreground">{data.task.sourceCount}</strong> sources</span>
            {stats.valid != null && (
              <span><strong className="text-foreground">{stats.valid}</strong> valid</span>
            )}
            {data.task.completedAt && (
              <span>collected {new Date(data.task.completedAt).toLocaleDateString()}</span>
            )}
            {data.share.expiresAt && (
              <span>link expires {new Date(data.share.expiresAt).toLocaleDateString()}</span>
            )}
            {data.share.truncated && (
              <span className="text-amber-600">showing first {records.length} records</span>
            )}
          </div>
          {Array.isArray(data.task.tags) && data.task.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.task.tags.map((t: string) => (
                <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t}</span>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6 space-y-3">
        {records.length === 0 && <p className="text-sm text-muted-foreground">This dataset has no records.</p>}
        {records.map((r: any) => (
          <article key={r.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-medium">{r.title || 'Untitled'}</h2>
              <span
                className={
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ' +
                  (r.confidence >= 75 ? 'bg-emerald-500/10 text-emerald-600' : r.confidence >= 50 ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600')
                }
              >
                {Math.round(r.confidence)}% confidence
              </span>
            </div>
            {r.summary && <p className="mt-1 text-xs text-muted-foreground">{r.summary}</p>}
            {fields.length > 0 && (
              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                {fields.map((f: any) => {
                  const key = f?.name
                  if (!key) return null
                  const v = r.data?.[key]
                  if (v === undefined || v === null || v === '') return null
                  return (
                    <div key={key} className="flex gap-2 min-w-0">
                      <dt className="text-muted-foreground shrink-0">{f.label || key}</dt>
                      <dd className="font-mono break-words min-w-0">{String(v).slice(0, 300)}</dd>
                    </div>
                  )
                })}
              </dl>
            )}
          </article>
        ))}

        {Array.isArray(data.sources) && data.sources.length > 0 && (
          <details className="rounded-lg border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">Sources ({data.sources.length})</summary>
            <ul className="mt-3 space-y-1.5">
              {data.sources.map((s: any) => (
                <li key={s.id} className="text-xs">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline break-all">
                    {s.title || s.url}
                  </a>
                  <span className="ml-2 text-muted-foreground">{s.hostName} · {s.fetchStatus}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <footer className="mx-auto max-w-6xl px-6 pb-10 pt-2 text-xs text-muted-foreground">
        Shared from Intellex · AI-Powered Data Intelligence Platform
      </footer>
    </main>
  )
}