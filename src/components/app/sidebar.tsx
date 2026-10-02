'use client'

import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Sparkles,
  ListChecks,
  Database,
  Globe,
  History,
  Brain,
  Search,
  Pin,
  FileText as TemplateIcon,
  TrendingUp as InsightsIcon,
  Bell as ActivityIcon,
  Settings as SettingsIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Section = 'dashboard' | 'new' | 'tasks' | 'datasets' | 'sources' | 'history'

interface NavItem {
  id: Section
  label: string
  icon: LucideIcon
  description: string
}

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Overview & analytics' },
  { id: 'new', label: 'New Collection', icon: Sparkles, description: 'Describe a data need' },
  { id: 'tasks', label: 'Tasks', icon: ListChecks, description: 'Manage collection runs' },
  { id: 'datasets', label: 'Datasets', icon: Database, description: 'Explore collected data' },
  { id: 'sources', label: 'Sources', icon: Globe, description: 'Trace provenance' },
  { id: 'history', label: 'History', icon: History, description: 'Workflow timeline' },
]

interface SidebarProps {
  section: Section
  onNavigate: (s: Section) => void
  taskCount?: number
  runningCount?: number
  pinnedCount?: number
}

export function Sidebar({ section, onNavigate, taskCount = 0, runningCount = 0, pinnedCount = 0 }: SidebarProps) {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/60 backdrop-blur-xl fixed top-0 left-0 h-screen z-40">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border shrink-0">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
          <Brain className="h-5 w-5 text-white" />
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar animate-pulse" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Intellex</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Data Intelligence</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 scrollbar-thin overflow-y-auto">
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Workspace</p>
        {NAV.map((item) => {
          const active = section === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              data-tour={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'group w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0 transition-colors', active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground group-hover:text-foreground')} />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="truncate">{item.label}</span>
                <span className="text-[10px] text-muted-foreground/70 truncate">{item.description}</span>
              </div>
              {item.id === 'tasks' && runningCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  {runningCount}
                </span>
              )}
            </button>
          )
        })}

        {/* Workspace status — connected to the workspace nav options, not pinned to the footer */}
        <div className="px-1 pt-3 mt-1">
          <div className="rounded-xl border border-sidebar-border bg-card/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total tasks</span>
              <div className="flex items-center gap-1.5">
                {pinnedCount > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-full px-1.5 py-0.5">
                    <Pin className="h-2.5 w-2.5 fill-amber-500" /> {pinnedCount}
                  </span>
                )}
                <span className="text-xs font-semibold text-foreground tabular-nums">{taskCount}</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                style={{ width: `${Math.min(100, (runningCount / Math.max(1, taskCount)) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
              {runningCount > 0 ? (
                <>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                  </span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">{runningCount} active run{runningCount > 1 ? 's' : ''}</span>
                </>
              ) : (
                <>No active runs</>
              )}
            </p>
          </div>
        </div>
      </nav>

      {/* Footer toolbar — quick actions */}
      <div className="shrink-0 border-t border-sidebar-border px-3 py-2.5 space-y-1.5 bg-sidebar/80">
        <button
          data-tour="quick-actions"
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="flex w-full items-center justify-between rounded-lg border border-sidebar-border bg-card/60 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Search className="h-3 w-3" /> Quick actions
          </span>
          <kbd className="h-4 px-1 rounded border border-border bg-muted text-[9px] font-mono">⌘K</kbd>
        </button>
        <div className="flex items-center gap-1" data-tour="sidebar-tools">
          <ToolbarButton icon={TemplateIcon} label="Templates" onClick={() => window.dispatchEvent(new CustomEvent('intellex:open-templates'))} />
          <ToolbarButton icon={InsightsIcon} label="Insights" onClick={() => window.dispatchEvent(new CustomEvent('intellex:open-insights'))} />
          <ToolbarButton icon={ActivityIcon} label="Activity" onClick={() => window.dispatchEvent(new CustomEvent('intellex:open-activity'))} />
          <ToolbarButton icon={SettingsIcon} label="Settings" onClick={() => window.dispatchEvent(new CustomEvent('intellex:open-settings'))} />
        </div>
      </div>
    </aside>
  )
}

function ToolbarButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[9px] text-muted-foreground hover:bg-accent hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
