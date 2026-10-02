// Source URLs reach page_reader from web_search results, which are steered by the
// LLM planner, which is steered by a user prompt. Without a check, that is an
// arbitrary-URL fetch on every run. This runs before the fetch so the obvious
// cases (non-http schemes, localhost, cloud metadata, private ranges) never leave
// the process.

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
])

/** True when the URL is safe to hand to a fetcher. */
export function isFetchableUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) return false
  // Credentials in a URL are a phishing/exfil trick, never legitimate here.
  if (url.username || url.password) return false

  // Literal private / loopback / link-local / CGNAT addresses.
  if (/^127\./.test(host)) return false
  if (/^10\./.test(host)) return false
  if (/^192\.168\./.test(host)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
  if (/^169\.254\./.test(host)) return false
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return false
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return false

  return true
}

/** Filters a list down to the URLs that are actually fetchable. */
export function partitionByFetchable(urls: string[]): { ok: string[]; blocked: string[] } {
  const ok: string[] = []
  const blocked: string[] = []
  for (const u of urls) (isFetchableUrl(u) ? ok : blocked).push(u)
  return { ok, blocked }
}