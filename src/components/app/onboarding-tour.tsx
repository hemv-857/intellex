'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, X, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// A spotlight tour: each step points at a real element on the page rather than
// describing it in a modal. Targets are addressed by [data-tour="..."], and any
// step whose target is missing or off-screen (mobile hides the sidebar) falls
// back to a centred card so the tour is never a dead end.

interface OnboardingTourProps {
  /** Key used to track dismissal in localStorage */
  storageKey?: string
  onComplete?: () => void
}

interface Step {
  title: string
  body: string
  /** [data-tour] value of the element to spotlight. Omit for a centred card. */
  target?: string
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Intellex 👋',
    body: 'Turn plain-English requests into clean, structured, source-backed datasets. This tour points at the real interface — about 30 seconds.',
  },
  {
    target: 'new',
    title: 'Start here',
    body: 'New Collection takes a plain-English request like "find 8 recent AI startup funding rounds" and designs a workflow for it — schema, search queries, validation rules.',
  },
  {
    target: 'tasks',
    title: 'Every run is a task',
    body: 'Tasks shows planned, running and completed collections. Pin what matters, move finished work to trash, duplicate a task to re-run its plan, or bulk-select to act on many at once.',
  },
  {
    target: 'datasets',
    title: 'Explore what you collected',
    body: 'Datasets searches across every completed collection. Semantic mode expands your query with the AI and ranks by relevance and recency; toggle Latest for the newest content.',
  },
  {
    target: 'sources',
    title: 'Trace where it came from',
    body: 'Sources lists every page the engine read, with fetch status and token cost. If a page failed or returned nothing, re-extract it without re-running the whole collection.',
  },
  {
    target: 'quick-actions',
    title: 'Move faster',
    body: '⌘K opens the command palette from anywhere. Press ? for the full shortcut sheet, and use vim-style g then a letter to jump between sections.',
  },
  {
    target: 'sidebar-tools',
    title: 'Templates, insights, activity',
    body: 'Save a prompt as a template for reuse, open Insights for platform-wide data quality, or read the Activity feed for a timestamped audit trail of every change.',
  },
  {
    title: "You're all set! 🚀",
    body: 'Finished a collection? Open it to export CSV, JSON or Excel, share a read-only link, or schedule a recurring re-run.',
  },
]

type Rect = { top: number; left: number; width: number; height: number }

const GAP = 8 // breathing room around the spotlight

export function OnboardingTour({ storageKey = 'intellex.onboarding.v1', onComplete }: OnboardingTourProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const rafId = useRef(0)
  const [popover, setPopover] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) {
        const t = setTimeout(() => setOpen(true), 800)
        return () => clearTimeout(t)
      }
    } catch {
      /* ignore */
    }
  }, [storageKey])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
    onComplete?.()
  }, [storageKey, onComplete])

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const progress = ((step + 1) / STEPS.length) * 100

  // Measure the target. Geometry is read after the browser has laid out (inside
  // rAF) rather than synchronously in the effect body, so this does not trigger
  // a cascading render.
  const measure = useCallback(() => {
    if (!open || !STEPS[step]?.target) {
      setRect(null)
      return
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].target}"]`)
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    // Hidden (display:none) or off-screen targets fall back to the centred card.
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
      setRect(null)
      return
    }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [open, step])

  useLayoutEffect(() => {
    if (!open) return
    if (STEPS[step]?.target) {
      document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].target}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    const raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [open, step, measure])

  useEffect(() => {
    if (!open) return
    const onReflow = () => {
      cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      cancelAnimationFrame(rafId.current)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, measure])

  // Position the popover next to the spotlight once we know its own size.
  useLayoutEffect(() => {
    if (!rect || !popoverRef.current) {
      const raf = requestAnimationFrame(() => setPopover(null))
      return () => cancelAnimationFrame(raf)
    }
    const card = popoverRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top = rect.top + rect.height + GAP + card.height
    if (top + card.height > vh - 12) {
      top = rect.top - GAP - card.height
    }
    top = Math.max(12, Math.min(top, vh - card.height - 12))

    let left = rect.left + rect.width / 2 - card.width / 2
    left = Math.max(12, Math.min(left, vw - card.width - 12))

    const raf = requestAnimationFrame(() => setPopover({ top, left }))
    return () => cancelAnimationFrame(raf)
  }, [rect])

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else dismiss()
  }
  const prev = () => setStep((s) => Math.max(0, s - 1))

  const spotlight = useMemo(
    () =>
      rect
        ? {
            top: rect.top - GAP,
            left: rect.left - GAP,
            width: rect.width + GAP * 2,
            height: rect.height + GAP * 2,
          }
        : null,
    [rect],
  )

  if (!open) return null

  const card = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding tour"
      className={cn(
        'w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-emerald-500/30 bg-card shadow-2xl overflow-hidden',
        rect && popover ? 'fixed z-[102]' : 'relative',
      )}
      style={rect && popover ? { top: popover.top, left: popover.left } : undefined}
    >
      <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <button
        onClick={dismiss}
        className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label="Skip tour"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="px-5 pt-7 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 mb-3">
          <Sparkles className="h-4.5 w-4.5 text-white" />
        </div>
        <h2 className="text-base font-bold tracking-tight mb-1.5 pr-6">{current.title}</h2>
        <p className="text-[13px] text-muted-foreground leading-relaxed">{current.body}</p>
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-3">
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

      <div className="flex items-center justify-between border-t border-border px-5 py-3 bg-muted/30">
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
  )

  return (
    <>
      {/* Transparent click-blocker so the app behind cannot be used mid-tour. */}
      <div className="fixed inset-0 z-[100]" aria-hidden />

      {spotlight ? (
        // The spotlight's own opaque spread-shadow dims everything OUTSIDE it,
        // which is what leaves the target lit. A separate dim layer would cover
        // the target too.
        <div
          className="fixed z-[101] pointer-events-none rounded-xl ring-2 ring-emerald-400/90 transition-all duration-300"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: '0 0 0 9999px oklch(0.18 0.02 165 / 0.62)',
          }}
        />
      ) : (
        <div className="fixed inset-0 z-[101]" style={{ background: 'oklch(0.18 0.02 165 / 0.62)' }} aria-hidden />
      )}

      {rect && popover ? (
        card
      ) : (
        <div className="fixed inset-0 z-[102] flex items-center justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto">{card}</div>
        </div>
      )}
    </>
  )
}

/** Hook to manually re-trigger the tour (e.g. from a "Replay tour" button) */
export function useReplayTour(storageKey = 'intellex.onboarding.v1') {
  return () => {
    try {
      localStorage.removeItem(storageKey)
      window.location.reload()
    } catch {
      /* ignore */
    }
  }
}