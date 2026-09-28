'use client'

import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, X, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OnboardingTourProps {
  /** Key used to track dismissal in localStorage */
  storageKey?: string
  onComplete?: () => void
}

interface Step {
  title: string
  body: string
  highlight?: string // CSS selector to highlight (best-effort, non-blocking)
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Intellex 👋',
    body: 'Turn plain-English requests into clean, structured, source-backed datasets. Let\'s take a 30-second tour.',
  },
  {
    title: '1. Describe what you need',
    body: 'Click "New Collection" and write a prompt like "Find 8 recent AI startup funding rounds". The AI will design a workflow (schema, search queries, validation rules) for you.',
  },
  {
    title: '2. Run the collection',
    body: 'Review the AI-generated plan, then click "Run Collection". The engine searches the live web, reads pages, extracts structured records, and deduplicates them — automatically.',
  },
  {
    title: '3. Explore your dataset',
    body: 'Open any completed task to see records with confidence scores, trace every source, inspect the schema, and export to Excel/CSV/JSON.',
  },
  {
    title: '4. Search semantically',
    body: 'In Datasets, the Semantic search uses AI to expand your query into synonyms + related terms, then ranks records by relevance + recency. Toggle "Latest" to surface the newest content.',
  },
  {
    title: '5. Work faster with shortcuts',
    body: 'Press ⌘K anytime for the command palette. Press ? to see all keyboard shortcuts. Pin important tasks, compare two tasks side-by-side, and schedule recurring runs.',
  },
  {
    title: 'You\'re all set! 🚀',
    body: 'Everything you do is logged in the Activity center (the bell icon). Your data is stored locally in SQLite. Happy collecting!',
  },
]

export function OnboardingTour({ storageKey = 'intellex.onboarding.v1', onComplete }: OnboardingTourProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(storageKey)
      if (!dismissed) {
        // small delay so it appears after first paint
        const t = setTimeout(() => setOpen(true), 800)
        return () => clearTimeout(t)
      }
    } catch {
      /* ignore */
    }
  }, [storageKey])

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
    onComplete?.()
  }

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else dismiss()
  }
  const prev = () => setStep((s) => Math.max(0, s - 1))

  if (!open) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in-up"
      style={{ background: 'oklch(0.18 0.02 165 / 0.55)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding tour"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-emerald-500/30 bg-card shadow-2xl overflow-hidden">
        {/* progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* close */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Skip tour"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* content */}
        <div className="px-6 pt-8 pb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 mb-4">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-lg font-bold tracking-tight mb-2">{current.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{current.body}</p>
        </div>

        {/* step dots */}
        <div className="flex items-center justify-center gap-1.5 pb-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === step ? 'w-6 bg-emerald-500' : i < step ? 'w-1.5 bg-emerald-400' : 'w-1.5 bg-muted-foreground/30',
              )}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3.5 bg-muted/30">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {step + 1} of {STEPS.length}
          </span>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={prev} className="h-8 text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
            )}
            <Button size="sm" onClick={next} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
              {isLast ? (
                <><Check className="h-3.5 w-3.5 mr-1" /> Got it</>
              ) : (
                <>Next <ArrowRight className="h-3.5 w-3.5 ml-1" /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Hook to manually re-trigger the tour (e.g. from a "Replay tour" button) */
export function useReplayTour(storageKey = 'intellex.onboarding.v1') {
  return () => {
    try {
      localStorage.removeItem(storageKey)
      // reload to re-trigger the tour effect
      window.location.reload()
    } catch {
      /* ignore */
    }
  }
}
