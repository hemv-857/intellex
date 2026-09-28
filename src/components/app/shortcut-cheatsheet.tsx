'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Keyboard, Command, ArrowUp, ArrowDown, CornerDownLeft, Esc } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ShortcutCheatSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Shortcut {
  keys: string[]
  label: string
  desc: string
}

const GROUPS: { title: string; icon: LucideIcon; tint: string; shortcuts: Shortcut[] }[] = [
  {
    title: 'Global',
    icon: Command,
    tint: 'text-emerald-500 bg-emerald-500/10',
    shortcuts: [
      { keys: ['⌘', 'K'], label: 'Command palette', desc: 'Open the fuzzy command search' },
      { keys: ['?'], label: 'This cheat sheet', desc: 'Show keyboard shortcuts' },
      { keys: ['Esc'], label: 'Close dialog', desc: 'Dismiss any open overlay' },
    ],
  },
  {
    title: 'Navigation',
    icon: Keyboard,
    tint: 'text-sky-500 bg-sky-500/10',
    shortcuts: [
      { keys: ['g', 'd'], label: 'Dashboard', desc: 'Go to dashboard' },
      { keys: ['g', 'n'], label: 'New Collection', desc: 'Create a new data collection' },
      { keys: ['g', 't'], label: 'Tasks', desc: 'Go to tasks list' },
      { keys: ['g', 'a'], label: 'Datasets', desc: 'Go to datasets explorer' },
      { keys: ['g', 's'], label: 'Sources', desc: 'Go to sources registry' },
      { keys: ['g', 'h'], label: 'History', desc: 'Go to workflow history timeline' },
    ],
  },
  {
    title: 'Actions',
    icon: Command,
    tint: 'text-violet-500 bg-violet-500/10',
    shortcuts: [
      { keys: ['n'], label: 'New collection', desc: 'Shortcut to the prompt input' },
      { keys: [','], label: 'Settings', desc: 'Open the settings panel' },
      { keys: ['b'], label: 'Activity', desc: 'Open activity & notifications' },
      { keys: ['p'], label: 'Templates', desc: 'Open prompt templates' },
      { keys: ['i'], label: 'Insights', desc: 'Open data quality insights' },
    ],
  },
]

export function ShortcutCheatSheet({ open, onOpenChange }: ShortcutCheatSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-4 w-4 text-emerald-500" /> Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>Work faster with these keyboard commands</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto scrollbar-thin max-h-[70vh] p-5 space-y-6">
          {GROUPS.map((group) => {
            const Icon = group.icon
            return (
              <section key={group.title}>
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md ${group.tint}`}>
                    <Icon className="h-3 w-3" />
                  </span>
                  {group.title}
                </h3>
                <div className="space-y-1">
                  {group.shortcuts.map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-accent/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{s.label}</div>
                        <div className="text-[11px] text-muted-foreground">{s.desc}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.keys.map((k, i) => (
                          <kbd
                            key={i}
                            className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-muted px-1.5 text-[11px] font-mono font-semibold text-foreground"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}

          {/* Footer hint */}
          <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-4">
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <Command className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">Pro tip:</span> Press{' '}
                <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 text-[9px] font-mono">⌘K</kbd>{' '}
                to open the command palette — it&apos;s the fastest way to navigate,
                open any tool, or toggle the theme without touching the mouse.
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
