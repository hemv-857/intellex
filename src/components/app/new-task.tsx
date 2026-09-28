'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Sparkles,
  Loader2,
  Rocket,
  Search,
  Database,
  ShieldCheck,
  Tag,
  Target,
  Trash2,
  RotateCcw,
  Lightbulb,
  Wand2,
  CheckCircle2,
  LayoutTemplate,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { api, type TaskDetail } from './shared'

const EXAMPLE_PROMPTS = [
  {
    icon: '💼',
    title: 'AI startup funding',
    prompt: 'Find 8 recent AI startup funding rounds, including company name, funding amount, investors, date, and a one-line description.',
  },
  {
    icon: '🎯',
    title: 'Remote design agencies',
    prompt: 'List 10 remote-first design agencies with their name, website, location, services offered, and starting price range.',
  },
  {
    icon: '📅',
    title: 'Tech conferences 2025',
    prompt: 'Collect 12 upcoming technology conferences in 2025 with name, date, location, organizer, and topic.',
  },
  {
    icon: '📊',
    title: 'SaaS pricing pages',
    prompt: 'Gather pricing details for 8 popular project management SaaS tools: product name, free tier limits, starting price, and key features.',
  },
  {
    icon: '🔬',
    title: 'AI research papers',
    prompt: 'Find recent AI research papers on retrieval-augmented generation with title, authors, abstract summary, and publication date.',
  },
  {
    icon: '🛒',
    title: 'E-commerce bestsellers',
    prompt: 'Collect 10 bestselling wireless headphones with product name, brand, price, rating, and key specs.',
  },
]

interface NewTaskProps {
  onCreated: (taskId: string) => void
  onCancel: () => void
  onOpenTemplates?: () => void
}

export function NewTask({ onCreated, onCancel, onOpenTemplates }: NewTaskProps) {
  const [prompt, setPrompt] = useState('')
  const [planning, setPlanning] = useState(false)
  const [running, setRunning] = useState(false)
  const [plan, setPlan] = useState<TaskDetail | null>(null)

  // Listen for template prefill events (from command palette / template picker)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string
      if (detail) {
        setPrompt(detail)
        setPlan(null)
      }
    }
    window.addEventListener('intellex:prefill-prompt', handler)
    return () => window.removeEventListener('intellex:prefill-prompt', handler)
  }, [])

  const handlePlan = async () => {
    if (prompt.trim().length < 10) {
      toast.error('Please describe your data need in a bit more detail.')
      return
    }
    setPlanning(true)
    setPlan(null)
    try {
      const res = await api<{ task: TaskDetail }>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      })
      setPlan(res.task)
      toast.success('Workflow designed by AI.')
    } catch (e) {
      toast.error((e as Error).message || 'Failed to design workflow')
    } finally {
      setPlanning(false)
    }
  }

  const handleRun = async () => {
    if (!plan) return
    setRunning(true)
    try {
      await api(`/api/tasks/${plan.id}/run`, { method: 'POST' })
      toast.success('Collection started. Tracking progress…')
      onCreated(plan.id)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to start collection')
    } finally {
      setRunning(false)
    }
  }

  const handleReset = () => {
    setPlan(null)
    setPrompt('')
  }

  return (
    <div className="space-y-6 animate-fade-in-up max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" /> New Data Collection
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Describe what you need in plain English. The AI will design the workflow, then you run it.
          </p>
        </div>
        {onOpenTemplates && (
          <Button variant="outline" size="sm" onClick={onOpenTemplates}>
            <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" /> Templates
          </Button>
        )}
      </div>

      {/* Prompt input */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-emerald-500" /> Describe your data requirement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Find me 10 recent AI startup funding rounds with company name, amount, investors, date, and a short description…"
            className="min-h-32 resize-y text-sm leading-relaxed"
            disabled={planning || !!plan}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{prompt.length} chars · be specific about fields you want</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
              {plan ? (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Start over
                </Button>
              ) : (
                <Button size="sm" onClick={handlePlan} disabled={planning || !prompt.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {planning ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Designing workflow…</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate Workflow</>}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Examples */}
      {!plan && !planning && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-medium">Example prompts</h3>
            <span className="text-xs text-muted-foreground">— click to use</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex.title}
                onClick={() => setPrompt(ex.prompt)}
                className="group text-left rounded-xl border border-border bg-card hover:border-emerald-500/40 hover:bg-accent/40 transition-all p-4"
              >
                <div className="text-2xl mb-2">{ex.icon}</div>
                <div className="text-sm font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{ex.title}</div>
                <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{ex.prompt}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Planning skeleton */}
      {planning && (
        <Card className="border-emerald-500/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <Loader2 className="h-5 w-5 text-emerald-500 animate-spin" />
              </div>
              <div>
                <p className="text-sm font-medium">AI is designing your workflow…</p>
                <p className="text-xs text-muted-foreground">Parsing requirements, defining schema, planning sources</p>
              </div>
            </div>
            <div className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
              <div className="grid grid-cols-2 gap-3">
                <SkeletonRow />
                <SkeletonRow />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan preview */}
      {plan && !planning && (
        <div className="space-y-4 animate-fade-in-up">
          <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent">
            <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Workflow Ready
                  </Badge>
                  <Badge variant="outline" className="bg-muted text-muted-foreground">planned</Badge>
                </div>
                <CardTitle className="text-lg">{plan.title}</CardTitle>
                <CardDescription className="mt-1 flex items-start gap-1.5">
                  <Target className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                  <span>{plan.objective}</span>
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex flex-wrap gap-2">
              {plan.tags.map((t) => (
                <Badge key={t} variant="secondary" className="bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">
                  <Tag className="h-2.5 w-2.5 mr-1" /> {t}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Schema */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="h-4 w-4 text-teal-500" /> Target Schema
                </CardTitle>
                <CardDescription>{plan.fields.length} fields to extract per record</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5">
                  {plan.fields.map((f) => (
                    <div key={f.name} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium">{f.name}</code>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-muted-foreground">{f.type}</Badge>
                          {f.required && <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">required</Badge>}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{f.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Search queries */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="h-4 w-4 text-sky-500" /> Search Strategy
                </CardTitle>
                <CardDescription>{plan.searchQueries.length} queries · {plan.sourceStrategy.length} source hints</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="space-y-1.5">
                  {plan.searchQueries.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg bg-sky-500/5 border border-sky-500/15 px-3 py-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-[10px] font-semibold text-sky-600 dark:text-sky-400">{i + 1}</span>
                      <code className="text-xs text-foreground/80 break-all">{q}</code>
                    </div>
                  ))}
                </div>
                {plan.sourceStrategy.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {plan.sourceStrategy.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] bg-muted/50">{s}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Validation rules */}
          {plan.validationRules.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" /> Validation Rules
                </CardTitle>
                <CardDescription>Records must satisfy these rules to be kept</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {plan.validationRules.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action bar */}
          <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/90 backdrop-blur-lg p-3 shadow-lg">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              Workflow is ready. Run it to start collecting data from the web.
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Discard
              </Button>
              <Button size="sm" onClick={handleRun} disabled={running} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-500/20">
                {running ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Starting…</> : <><Rocket className="h-3.5 w-3.5 mr-1.5" /> Run Collection</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="space-y-1.5">
      <div className="h-3 w-1/4 rounded bg-muted animate-pulse" />
      <div className="h-8 w-full rounded bg-muted/60 animate-pulse" />
    </div>
  )
}
