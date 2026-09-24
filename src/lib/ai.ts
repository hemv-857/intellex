import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldDef {
  name: string
  type: 'string' | 'number' | 'date' | 'url' | 'email' | 'boolean'
  description: string
  required?: boolean
}

export interface WorkflowStep {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  detail?: string
}

export interface WorkflowPlan {
  title: string
  objective: string
  fields: FieldDef[]
  searchQueries: string[]
  sourceStrategy: string[]
  validationRules: string[]
  tags: string[]
}

export interface Progress {
  step: string
  message: string
  current: number
  total: number
}

export interface TaskStats {
  items: number
  sources: number
  valid: number
  duplicates: number
  tokens: number
}

// ---------------------------------------------------------------------------
// ZAI singleton
// ---------------------------------------------------------------------------

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null
export async function getZAI() {
  if (!_zai) _zai = await ZAI.create()
  return _zai
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJsonParse<T>(text: string, fallback: T): T {
  if (!text) return fallback
  try {
    // Strip markdown code fences if present
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
    return JSON.parse(cleaned) as T
  } catch {
    // Try to extract the first {...} block
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as T
      } catch {
        return fallback
      }
    }
    return fallback
  }
}

function normalizeKey(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim()
}

function dedupeKeyFrom(data: Record<string, unknown>, fields: FieldDef[]): string {
  const parts: string[] = []
  for (const f of fields) {
    const v = data[f.name]
    if (v !== undefined && v !== null && String(v).trim()) {
      parts.push(normalizeKey(String(v)))
    }
  }
  return parts.join(' | ')
}

// ---------------------------------------------------------------------------
// Workflow planner
// ---------------------------------------------------------------------------

const PLANNER_SYSTEM = `You are the planning brain of an AI Data Intelligence Platform.
Given a natural-language business data request, design a precise, executable data-collection workflow.

You MUST respond with ONLY a single valid JSON object (no markdown, no commentary) using this exact schema:
{
  "title": "short, human-readable task title (max 8 words)",
  "objective": "one or two sentence description of what the dataset should contain",
  "fields": [
    { "name": "snake_case_field_name", "type": "string|number|date|url|email|boolean", "description": "what this field captures", "required": true }
  ],
  "searchQueries": ["3 to 5 specific web-search queries that would surface this information, optimized for a general web search engine"],
  "sourceStrategy": ["short notes about preferred source types, e.g. 'news sites', 'company about pages', 'official announcements'"],
  "validationRules": ["rules to validate extracted items, e.g. 'must have a non-empty company name', 'date must be within last 12 months'"],
  "tags": ["3 to 6 lowercase tags"]
}

Rules:
- Define 4 to 8 fields. Always include a recognizable identifier field (e.g. company, name, title) as the first field.
- Keep queries realistic and diverse so they cover different angles of the request.
- BIAS TOWARD LATEST DATA: include a date/published field whenever the request mentions time-sensitive info (funding, news, events, launches), and phrase at least one query to emphasize recency (e.g. append "2025" or "recent" or "latest").
- Keep the JSON minimal and valid.`

export async function planWorkflow(prompt: string): Promise<WorkflowPlan> {
  const zai = await getZAI()
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: PLANNER_SYSTEM },
      { role: 'user', content: `Business request:\n"""${prompt}"""\n\nReturn the workflow JSON now.` },
    ],
    thinking: { type: 'disabled' },
  })

  const raw = completion.choices[0]?.message?.content ?? ''
  const plan = safeJsonParse<WorkflowPlan>(raw, {
    title: prompt.slice(0, 60),
    objective: prompt,
    fields: [
      { name: 'title', type: 'string', description: 'Primary identifier', required: true },
      { name: 'description', type: 'string', description: 'Short description' },
      { name: 'source', type: 'string', description: 'Source name' },
      { name: 'url', type: 'url', description: 'Source URL' },
    ],
    searchQueries: [prompt],
    sourceStrategy: ['web'],
    validationRules: ['must have a non-empty title'],
    tags: ['general'],
  })

  // sanitize / fill gaps
  if (!plan.fields || plan.fields.length === 0) {
    plan.fields = [
      { name: 'title', type: 'string', description: 'Primary identifier', required: true },
      { name: 'description', type: 'string', description: 'Short description' },
    ]
  }
  if (!plan.searchQueries || plan.searchQueries.length === 0) plan.searchQueries = [prompt]
  if (!plan.tags || plan.tags.length === 0) plan.tags = ['general']
  if (!plan.sourceStrategy) plan.sourceStrategy = []
  if (!plan.validationRules) plan.validationRules = []

  return plan
}

// ---------------------------------------------------------------------------
// Execution engine
// ---------------------------------------------------------------------------

interface SearchResultItem {
  url: string
  name: string
  snippet: string
  host_name: string
  rank: number
  date: string
  favicon: string
}

const MAX_SOURCES_PER_QUERY = 4
const MAX_TOTAL_SOURCES = 8
const EXTRACT_MAX_ITEMS_PER_SOURCE = 6

function buildInitialWorkflow(): WorkflowStep[] {
  return [
    { id: 'plan', name: 'Parse requirement & design workflow', status: 'completed' },
    { id: 'search', name: 'Search permitted sources', status: 'pending' },
    { id: 'fetch', name: 'Fetch & read source pages', status: 'pending' },
    { id: 'extract', name: 'Extract structured records', status: 'pending' },
    { id: 'clean', name: 'Clean, validate & deduplicate', status: 'pending' },
    { id: 'finalize', name: 'Finalize dataset', status: 'pending' },
  ]
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function buildExtractionPrompt(
  plan: WorkflowPlan,
  pageTitle: string,
  pageUrl: string,
  snippet: string,
  content: string,
) {
  const fieldsSchema = plan.fields
    .map((f) => `- ${f.name} (${f.type})${f.required ? ' [required]' : ''}: ${f.description}`)
    .join('\n')

  return `You are a meticulous data extraction engine for a Data Intelligence Platform.

DATASET OBJECTIVE: ${plan.objective}

TARGET SCHEMA (extract these fields for each record):
${fieldsSchema}

VALIDATION RULES:
${plan.validationRules.map((r) => `- ${r}`).join('\n') || '- record must have at least the required fields populated'}

SOURCE:
- Title: ${pageTitle}
- URL: ${pageUrl}
${snippet ? `- Search snippet: ${snippet.slice(0, 400)}` : ''}

PAGE CONTENT (plain text, may be truncated):
"""
${content.slice(0, 6000)}
"""

Extract up to ${EXTRACT_MAX_ITEMS_PER_SOURCE} distinct records that satisfy the objective from the content above.
If the content mentions multiple relevant entities (e.g. several funding rounds, several companies), create one record per entity.
Only include records whose information is actually supported by the content. Do not invent data, but DO extract every genuine record that is present.

Respond with ONLY a valid JSON object (no markdown, no prose) in this exact shape:
{"records": [{"${plan.fields[0]?.name || 'title'}": "value", ${plan.fields.slice(1).map((f) => `"${f.name}": "value"`).join(', ')}}]}

If genuinely no records are present, return {"records": []}.`
}

interface ExtractedRecord {
  [key: string]: unknown
}

async function extractFromSource(
  plan: WorkflowPlan,
  source: { url: string; title: string; snippet?: string },
): Promise<{ records: ExtractedRecord[]; tokens: number; title: string }> {
  const zai = await getZAI()
  let pageData: { title?: string; url?: string; html?: string; publishedTime?: string } | null = null
  let tokens = 0

  try {
    const result: any = await zai.functions.invoke('page_reader', { url: source.url })
    if (result?.data) {
      pageData = {
        title: result.data.title,
        url: result.data.url,
        html: result.data.html,
        publishedTime: result.data.publishedTime,
      }
      tokens = result.data.usage?.tokens ?? result.meta?.usage?.tokens ?? 0
    }
  } catch (e) {
    // page_reader failed, fall back to snippet-only extraction
  }

  const title = pageData?.title || source.title
  const snippet = source.snippet || ''
  // Convert HTML to plain text for much better extraction quality
  const pageText = pageData?.html ? htmlToText(pageData.html) : ''
  // Combine snippet + cleaned page text. Snippet often already contains the key facts.
  const content = (snippet ? `Snippet: ${snippet}\n\n` : '') + (pageText || '')

  if (!content || content.trim().length < 40) {
    return { records: [], tokens, title }
  }

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: 'You are a precise data extraction engine that outputs only valid JSON, nothing else.' },
      { role: 'user', content: buildExtractionPrompt(plan, title, source.url, snippet, content) },
    ],
    thinking: { type: 'disabled' },
  })

  const raw = completion.choices[0]?.message?.content ?? ''
  const parsed = safeJsonParse<{ records?: ExtractedRecord[] }>(raw, { records: [] })
  const records = Array.isArray(parsed.records) ? parsed.records : []
  return { records, tokens, title }
}

export async function executeWorkflow(taskId: string): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId } })
  if (!task) return

  const plan: WorkflowPlan = {
    title: task.title,
    objective: task.objective || task.prompt,
    fields: task.fields ? safeJsonParse<FieldDef[]>(task.fields, []) : [],
    searchQueries: task.searchQueries ? safeJsonParse<string[]>(task.searchQueries, []) : [],
    sourceStrategy: task.sourceStrategy ? safeJsonParse<string[]>(task.sourceStrategy, []) : [],
    validationRules: task.validationRules ? safeJsonParse<string[]>(task.validationRules, []) : [],
    tags: task.tags ? safeJsonParse<string[]>(task.tags, []) : [],
  }

  const workflow = task.workflow ? safeJsonParse<WorkflowStep[]>(task.workflow, buildInitialWorkflow()) : buildInitialWorkflow()
  const stats: TaskStats = { items: 0, sources: 0, valid: 0, duplicates: 0, tokens: 0 }
  const setStep = (id: string, status: WorkflowStep['status'], detail?: string) => {
    const s = workflow.find((w) => w.id === id)
    if (s) {
      s.status = status
      if (detail !== undefined) s.detail = detail
    }
  }
  const save = async (status: string, progress: Progress) => {
    await db.task.update({
      where: { id: taskId },
      data: { status, workflow: JSON.stringify(workflow), progress: JSON.stringify(progress), stats: JSON.stringify(stats) },
    })
  }

  try {
    // ---------- Step: search ----------
    setStep('search', 'running')
    await save('running', { step: 'search', message: 'Searching permitted sources…', current: 0, total: plan.searchQueries.length })

    const zai = await getZAI()
    const seenUrls = new Set<string>()
    const collectedSources: {
      url: string
      title: string
      snippet: string
      hostName: string
      favicon: string
      publishedTime?: string
      rank: number
    }[] = []

    for (let qi = 0; qi < plan.searchQueries.length; qi++) {
      const q = plan.searchQueries[qi]
      try {
        // Bias toward the latest data: request recency for the first couple queries
        // so the engine surfaces recently-published content.
        const searchArgs: any = { query: q, num: MAX_SOURCES_PER_QUERY + 2 }
        if (qi < 2) searchArgs.recency_days = 365
        const results = await zai.functions.invoke('web_search', searchArgs)
        const arr = (Array.isArray(results) ? results : []) as SearchResultItem[]
        for (const r of arr) {
          if (!r?.url || seenUrls.has(r.url)) continue
          if (collectedSources.length >= MAX_TOTAL_SOURCES) break
          seenUrls.add(r.url)
          collectedSources.push({
            url: r.url,
            title: r.name,
            snippet: r.snippet,
            hostName: r.host_name,
            favicon: r.favicon,
            publishedTime: r.date,
            rank: collectedSources.length,
          })
        }
      } catch (e) {
        // ignore single-query failure
      }
      await save('running', { step: 'search', message: `Searching: "${q.slice(0, 40)}${q.length > 40 ? '…' : ''}"`, current: qi + 1, total: plan.searchQueries.length })
      if (collectedSources.length >= MAX_TOTAL_SOURCES) break
    }

    // persist source rows
    for (const s of collectedSources) {
      await db.dataSource.create({
        data: {
          taskId,
          url: s.url,
          title: s.title,
          snippet: s.snippet,
          hostName: s.hostName,
          favicon: s.favicon,
          publishedTime: s.publishedTime,
          rank: s.rank,
          fetchStatus: 'pending',
        },
      })
    }
    stats.sources = collectedSources.length
    setStep('search', 'completed', `${collectedSources.length} candidate sources from ${plan.searchQueries.length} queries`)
    await save('running', { step: 'search', message: 'Sources gathered', current: plan.searchQueries.length, total: plan.searchQueries.length })

    // ---------- Step: fetch + extract ----------
    setStep('fetch', 'running')
    setStep('extract', 'running')
    const sourceRows = await db.dataSource.findMany({ where: { taskId }, orderBy: { rank: 'asc' } })

    const allRecords: { record: ExtractedRecord; sourceId: string; title: string }[] = []

    for (let si = 0; si < sourceRows.length; si++) {
      const src = sourceRows[si]
      await save('running', {
        step: 'fetch',
        message: `Reading source ${si + 1}/${sourceRows.length}: ${src.hostName || ''}`,
        current: si + 1,
        total: sourceRows.length,
      })
      try {
        const { records, tokens, title } = await extractFromSource(plan, { url: src.url, title: src.title || '', snippet: src.snippet || '' })
        stats.tokens += tokens
        await db.dataSource.update({
          where: { id: src.id },
          data: {
            fetchStatus: 'fetched',
            fetchedAt: new Date(),
            tokensUsed: tokens,
            title: title || src.title,
            contentExcerpt: (records.length ? `Extracted ${records.length} record(s)` : 'No records extracted'),
          },
        })
        for (const record of records) {
          allRecords.push({ record, sourceId: src.id, title: title || src.title || '' })
        }
      } catch (e) {
        await db.dataSource.update({
          where: { id: src.id },
          data: { fetchStatus: 'failed', contentExcerpt: (e as Error).message?.slice(0, 200) || 'fetch failed' },
        })
      }
    }
    setStep('fetch', 'completed', `${sourceRows.length} sources processed`)
    setStep('extract', 'completed', `${allRecords.length} raw records extracted`)
    await save('running', { step: 'extract', message: 'Extraction complete', current: sourceRows.length, total: sourceRows.length })

    // ---------- Step: clean, validate, dedupe ----------
    setStep('clean', 'running')
    await save('running', { step: 'clean', message: 'Cleaning, validating & deduplicating…', current: 0, total: allRecords.length })

    const seenKeys = new Set<string>()
    let validCount = 0
    let dupCount = 0
    let written = 0

    for (let i = 0; i < allRecords.length; i++) {
      const { record, sourceId, title } = allRecords[i]
      // Validate: required fields present & non-empty
      const missingRequired = plan.fields.filter((f) => f.required).some((f) => {
        const v = record[f.name]
        return v === undefined || v === null || String(v).trim() === ''
      })
      const valid = !missingRequired

      const key = dedupeKeyFrom(record, plan.fields)
      const isDup = key && seenKeys.has(key)
      if (isDup) {
        dupCount++
        continue
      }
      if (key) seenKeys.add(key)

      // Confidence score: ratio of populated fields
      const populated = plan.fields.filter((f) => {
        const v = record[f.name]
        return v !== undefined && v !== null && String(v).trim() !== ''
      }).length
      const confidence = plan.fields.length ? Math.round((populated / plan.fields.length) * 100) : 0

      const itemTitle = String(record[plan.fields[0]?.name] || title || 'Untitled')
      const summaryParts = plan.fields.slice(1, 4).map((f) => {
        const v = record[f.name]
        return v ? `${f.name}: ${String(v).slice(0, 80)}` : null
      }).filter(Boolean)
      const summary = summaryParts.join(' · ')

      await db.dataItem.create({
        data: {
          taskId,
          sourceId,
          data: JSON.stringify(record),
          title: itemTitle.slice(0, 300),
          summary: summary.slice(0, 500),
          confidence,
          valid,
          dedupeKey: key || null,
        },
      })
      if (valid) validCount++
      written++
    }

    stats.items = written
    stats.valid = validCount
    stats.duplicates = dupCount
    setStep('clean', 'completed', `${written} kept, ${dupCount} duplicates removed, ${validCount} valid`)
    await save('running', { step: 'clean', message: 'Cleaning complete', current: allRecords.length, total: allRecords.length })

    // ---------- Finalize ----------
    setStep('finalize', 'completed', 'Dataset ready')
    await db.task.update({
      where: { id: taskId },
      data: {
        status: 'completed',
        workflow: JSON.stringify(workflow),
        progress: JSON.stringify({ step: 'finalize', message: 'Dataset ready', current: 1, total: 1 }),
        stats: JSON.stringify(stats),
      },
    })
  } catch (e) {
    const msg = (e as Error).message || 'Unknown execution error'
    setStep('running' as any, 'failed', msg)
    await db.task.update({
      where: { id: taskId },
      data: {
        status: 'failed',
        error: msg,
        workflow: JSON.stringify(workflow),
        stats: JSON.stringify(stats),
        progress: JSON.stringify({ step: 'error', message: msg, current: 0, total: 0 }),
      },
    })
  }
}

// ---------------------------------------------------------------------------
// In-memory execution registry (prevents duplicate concurrent runs in dev)
// ---------------------------------------------------------------------------

const runningTasks = new Set<string>()
export function isRunning(taskId: string) {
  return runningTasks.has(taskId)
}
export function markRunning(taskId: string) {
  runningTasks.add(taskId)
}
export function markDone(taskId: string) {
  runningTasks.delete(taskId)
}

// ---------------------------------------------------------------------------
// Semantic search — LLM-powered query expansion + relevance scoring
// ---------------------------------------------------------------------------

export interface SemanticRecord {
  id: string
  taskId: string
  taskTitle: string
  title: string | null
  summary: string | null
  data: Record<string, unknown>
  tags: string[]
  confidence: number
  valid: boolean
  createdAt: string
}

export interface SemanticHit extends SemanticRecord {
  score: number
  recencyScore: number
  matchedTerms: string[]
  contentDate: string | null
}

export type SortMode = 'relevance' | 'latest'
export type DateRange = 'any' | '7d' | '30d' | '90d' | '365d'

const DATE_FIELDS = [
  'date', 'published', 'published_date', 'publishedDate', 'funding_date', 'fundingDate',
  'launch_date', 'launchDate', 'event_date', 'eventDate', 'announcement_date', 'announcementDate',
  'updated', 'updated_at', 'updatedAt', 'release_date', 'releaseDate', 'posted', 'posted_at',
]

const RECENT_DATE_PATTERNS = [
  /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/,
  /\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2})\b/,
  /\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s*(20\d{2})\b/i,
  /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\b/i,
]

export function extractContentDate(data: Record<string, unknown>, fallback?: string): string | null {
  // 1. Look for explicit date fields in the record data
  for (const field of DATE_FIELDS) {
    const v = data[field]
    if (v && typeof v === 'string' && v.trim()) {
      const parsed = parseDateValue(v)
      if (parsed) return parsed
    }
  }
  // 2. Scan all string values for recognizable date patterns
  for (const v of Object.values(data || {})) {
    if (typeof v !== 'string' || !v) continue
    const parsed = parseDateValue(v)
    if (parsed) return parsed
  }
  // 3. Fall back to the record's collection time
  return fallback || null
}

function parseDateValue(v: string): string | null {
  const s = v.trim()
  // ISO check
  const iso = Date.parse(s)
  if (!isNaN(iso) && s.length >= 8) {
    const d = new Date(iso)
    if (d.getFullYear() >= 2000 && d.getFullYear() <= new Date().getFullYear() + 1) {
      return d.toISOString()
    }
  }
  // pattern check
  for (const re of RECENT_DATE_PATTERNS) {
    const m = s.match(re)
    if (m) {
      const parsed = Date.parse(m[0])
      if (!isNaN(parsed)) {
        const d = new Date(parsed)
        if (d.getFullYear() >= 2000 && d.getFullYear() <= new Date().getFullYear() + 1) {
          return d.toISOString()
        }
      }
    }
  }
  return null
}

export function recencyBoost(contentDate: string | null, collectedAt: string): number {
  const now = Date.now()
  const ref = contentDate ? new Date(contentDate).getTime() : new Date(collectedAt).getTime()
  if (isNaN(ref)) return 0
  const daysAgo = Math.max(0, (now - ref) / (1000 * 60 * 60 * 24))
  // Exponential decay: 0 days ago → 100, 30 days ago → ~37, 90 days ago → ~8, 365 days ago → ~0
  // score = 100 * e^(-days/30)
  const boost = 100 * Math.exp(-daysAgo / 45)
  return Math.round(boost)
}

const QUERY_EXPANDER_SYSTEM = `You are a search query expansion engine for a Data Intelligence Platform.
Given a user's natural-language search query, produce a list of related search terms, synonyms, and
paraphrases that would help surface semantically relevant records.

Respond with ONLY a JSON object (no markdown, no prose) in this exact shape:
{"terms": ["term1", "term2", "term3", ...]}

Rules:
- Return 4 to 8 terms.
- Include the original query's key words.
- Include synonyms, abbreviations, and related domain terms.
- Use lowercase, single words or short phrases (max 3 words each).
- Do NOT include generic words like "data", "record", "find", "list".
- Do NOT include the query verbatim if it is a full sentence — extract the key concepts.`

const expansionCache = new Map<string, { terms: string[]; ts: number }>()
const EXPANSION_TTL = 5 * 60 * 1000 // 5 minutes

export async function expandQuery(query: string): Promise<string[]> {
  const key = query.toLowerCase().trim()
  if (!key) return []

  const cached = expansionCache.get(key)
  if (cached && Date.now() - cached.ts < EXPANSION_TTL) {
    return cached.terms
  }

  try {
    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: QUERY_EXPANDER_SYSTEM },
        { role: 'user', content: `Query: "${query}"\n\nReturn the expansion JSON now.` },
      ],
      thinking: { type: 'disabled' },
    })
    const raw = completion.choices[0]?.message?.content ?? ''
    const parsed = safeJsonParse<{ terms?: string[] }>(raw, { terms: [] })
    const terms = Array.isArray(parsed.terms)
      ? parsed.terms.map((t) => String(t).toLowerCase().trim()).filter((t) => t.length > 1).slice(0, 8)
      : []
    // Always ensure the original query's words are included
    const originalWords = key.split(/\s+/).filter((w) => w.length > 2)
    const allTerms = [...new Set([...originalWords, ...terms])]
    expansionCache.set(key, { terms: allTerms, ts: Date.now() })
    return allTerms
  } catch {
    // Fallback: just split the query into words
    const words = key.split(/\s+/).filter((w) => w.length > 2)
    return words
  }
}

export function scoreRecord(record: SemanticRecord, terms: string[]): SemanticHit {
  const title = (record.title || '').toLowerCase()
  const taskTitle = (record.taskTitle || '').toLowerCase()
  const summary = (record.summary || '').toLowerCase()
  const tags = (record.tags || []).map((t) => String(t).toLowerCase())
  const dataStr = JSON.stringify(record.data || {}).toLowerCase()

  let score = 0
  const matched: string[] = []

  for (const term of terms) {
    let termMatched = false
    if (title.includes(term)) {
      score += 5
      termMatched = true
    }
    if (taskTitle.includes(term)) {
      score += 3
      termMatched = true
    }
    if (tags.some((t) => t.includes(term))) {
      score += 3
      termMatched = true
    }
    if (summary.includes(term)) {
      score += 2
      termMatched = true
    }
    if (dataStr.includes(term)) {
      score += 1
      termMatched = true
    }
    if (termMatched && !matched.includes(term)) matched.push(term)
  }

  const contentDate = extractContentDate(record.data || {}, record.createdAt)
  const recencyScore = recencyBoost(contentDate, record.createdAt)

  // Blend relevance + recency: weight relevance higher but let recency break ties
  // and surface newer content. Final score = relevance*3 + recency/10 + confidence/25
  score = score * 3 + Math.round(recencyScore / 10) + Math.round(record.confidence / 25)

  return { ...record, score, recencyScore, matchedTerms: matched, contentDate }
}

export function withinDateRange(contentDate: string | null, collectedAt: string, range: DateRange): boolean {
  if (range === 'any') return true
  const days: Record<Exclude<DateRange, 'any'>, number> = {
    '7d': 7, '30d': 30, '90d': 90, '365d': 365,
  }
  const d = days[range as Exclude<DateRange, 'any'>]
  const ref = contentDate ? new Date(contentDate).getTime() : new Date(collectedAt).getTime()
  if (isNaN(ref)) return range === '365d' // if unknown date, only keep on wide range
  const daysAgo = (Date.now() - ref) / (1000 * 60 * 60 * 24)
  return daysAgo <= d
}

export async function semanticSearch(
  records: SemanticRecord[],
  query: string,
  options: { limit?: number; sort?: SortMode; dateRange?: DateRange } = {},
): Promise<SemanticHit[]> {
  const { limit = 100, sort = 'relevance', dateRange = 'any' } = options
  const terms = await expandQuery(query)
  if (terms.length === 0) return []

  const hits = records
    .map((r) => scoreRecord(r, terms))
    .filter((h) => h.score > 0)
    .filter((h) => withinDateRange(h.contentDate, h.createdAt, dateRange))
    .sort((a, b) => {
      if (sort === 'latest') {
        const aDate = new Date(a.contentDate || a.createdAt).getTime()
        const bDate = new Date(b.contentDate || b.createdAt).getTime()
        return bDate - aDate
      }
      // relevance (already blends recency)
      return b.score - a.score
    })

  return hits.slice(0, limit)
}

export { buildInitialWorkflow }
