'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Search,
  LayoutDashboard,
  Sparkles,
  ListChecks,
  Database,
  Globe,
  History,
  Rocket,
  Moon,
  Sun,
  CornerDownLeft,
  Plus,
  Download,
  Trash2,
  Settings,
  Bell,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Section } from './sidebar'
import type { LucideIcon } from 'lucide-react'

interface Command {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  shortcut?: string[]
  section: string
  action: () => void
  keywords?: string[]
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  section: Section
  onNavigate: (s: Section) => void
  onNewCollection: () => void
  onToggleTheme: () => void
  onOpenSettings: () => void
  onOpenActivity: () => void
  activeTaskId?: string | null
  hasActiveTask: boolean
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onNewCollection,
  onToggleTheme,
  onOpenSettings,
  onOpenActivity,
  hasActiveTask,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands: Command[] = [
    { id: 'nav-dashboard', label: 'Go to Dashboard', icon: LayoutDashboard, section: 'Navigation', action: () => onNavigate('dashboard'), keywords: ['home', 'overview'] },
    { id: 'nav-new', label: 'New Collection', icon: Sparkles, section: 'Navigation', action: onNewCollection, keywords: ['create', 'prompt'] },
    { id: 'nav-tasks', label: 'Go to Tasks', icon: ListChecks, section: 'Navigation', action: () => onNavigate('tasks') },
    { id: 'nav-datasets', label: 'Go to Datasets', icon: Database, section: 'Navigation', action: () => onNavigate('datasets'), keywords: ['search', 'data'] },
    { id: 'nav-sources', label: 'Go to Sources', icon: Globe, section: 'Navigation', action: () => onNavigate('sources') },
    { id: 'nav-history', label: 'Go to History', icon: History, section: 'Navigation', action: () => onNavigate('history') },
    { id: 'action-settings', label: 'Open Settings', icon: Settings, section: 'Actions', action: onOpenSettings, keywords: ['preferences', 'config'] },
    { id: 'action-activity', label: 'View Activity & Notifications', icon: Bell, section: 'Actions', action: onOpenActivity, keywords: ['log', 'audit', 'history'] },
    {
      id: 'action-theme',
      label: 'Toggle Theme',
      icon: Sun,
      section: 'Actions',
      action: onToggleTheme,
      keywords: ['dark', 'light', 'mode'],
    },
  ]

  const filtered = commands.filter((c) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      c.label.toLowerCase().includes(q) ||
      c.section.toLowerCase().includes(q) ||
      (c.keywords || []).some((k) => k.includes(q))
    )
  })

  // group by section preserving order
  const sections: { name: string; items: Command[] }[] = []
  for (const c of filtered) {
    let s = sections.find((x) => x.name === c.section)
    if (!s) {
      s = { name: c.section, items: [] }
      sections.push(s)
    }
    s.items.push(c)
  }

  const flatFiltered = sections.flatMap((s) => s.items)

  const runCommand = useCallback((cmd?: Command) => {
    if (!cmd) return
    cmd.action()
    onOpenChange(false)
    setQuery('')
    setActiveIndex(0)
  }, [onOpenChange])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, flatFiltered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        runCommand(flatFiltered[activeIndex])
      } else if (e.key === 'Escape') {
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, flatFiltered, activeIndex, runCommand, onOpenChange])

  if (!open) return null

  let runningIdx = -1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-xl overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin p-2">
          {flatFiltered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No commands match &quot;{query}&quot;</div>
          ) : (
            sections.map((s) => (
              <div key={s.name} className="mb-1">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{s.name}</div>
                {s.items.map((c) => {
                  runningIdx++
                  const idx = runningIdx
                  const Icon = c.icon
                  const active = idx === activeIndex
                  return (
                    <button
                      key={c.id}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => runCommand(c)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                        active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} />
                      <span className="flex-1 truncate">{c.label}</span>
                      {active && <CornerDownLeft className="h-3 w-3 text-muted-foreground" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="h-4 px-1 rounded border border-border bg-muted">↑</kbd><kbd className="h-4 px-1 rounded border border-border bg-muted">↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="h-4 px-1 rounded border border-border bg-muted">↵</kbd> select</span>
          </div>
          <span className="flex items-center gap-1"><kbd className="h-4 px-1 rounded border border-border bg-muted">⌘K</kbd> toggle</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
