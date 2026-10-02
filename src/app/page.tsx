'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard,
  Sparkles,
  ListChecks,
  Database,
  Globe,
  History,
  Brain,
  Activity,
  Command as CommandIcon,
  Bell,
  TrendingUp,
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Sidebar, type Section } from '@/components/app/sidebar'
import { Dashboard } from '@/components/app/dashboard'
import { NewTask } from '@/components/app/new-task'
import { TasksList } from '@/components/app/tasks-list'
import { TaskDetailView } from '@/components/app/task-detail'
import { Datasets } from '@/components/app/datasets'
import { SourcesView } from '@/components/app/sources-view'
import { HistoryView } from '@/components/app/history'
import { CommandPalette } from '@/components/app/command-palette'
import { ActivityCenter } from '@/components/app/activity-center'
import { SettingsPanel, type Theme } from '@/components/app/settings-panel'
import { InsightsModal } from '@/components/app/insights-modal'
import { TemplatePicker } from '@/components/app/template-picker'
import { CompareModal } from '@/components/app/compare-modal'
import { ShortcutCheatSheet } from '@/components/app/shortcut-cheatsheet'
import { OnboardingTour, useReplayTour } from '@/components/app/onboarding-tour'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { api, type TaskListItem } from '@/components/app/shared'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

const MOBILE_NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'new', label: 'New', icon: Sparkles },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'datasets', label: 'Data', icon: Database },
  { id: 'sources', label: 'Sources', icon: Globe },
  { id: 'history', label: 'History', icon: History },
]

export default function Home() {
  const [section, setSection] = useState<Section>('dashboard')
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [taskCount, setTaskCount] = useState(0)
  const [runningCount, setRunningCount] = useState(0)
  const [pinnedCount, setPinnedCount] = useState(0)
  const [activityCount, setActivityCount] = useState(0)

  // Modal/overlay states
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false)
  const [allTasks, setAllTasks] = useState<TaskListItem[]>([])

  const { setTheme, resolvedTheme } = useTheme()

  const openTask = useCallback((id: string) => {
    setActiveTaskId(id)
    setSection('task' as any)
  }, [])

  const navigate = useCallback((s: Section) => {
    setSection(s)
    if (s !== ('task' as any)) setActiveTaskId(null)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [setTheme, resolvedTheme])

  const handleThemeChange = useCallback((t: Theme) => {
    setTheme(t)
  }, [setTheme])

  const replayTour = useReplayTour()

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNavigate: navigate,
    onNewCollection: () => navigate('new'),
    onOpenCommandPalette: () => setPaletteOpen((o) => !o),
    onOpenSettings: () => setSettingsOpen(true),
    onOpenActivity: () => setActivityOpen(true),
    onOpenTemplates: () => setTemplatesOpen(true),
    onOpenInsights: () => setInsightsOpen(true),
    onOpenCompare: () => setCompareOpen(true),
    onOpenCheatSheet: () => setCheatsheetOpen(true),
    onToggleTheme: toggleTheme,
  })

  // Listen for sidebar toolbar custom events
  useEffect(() => {
    const openTemplates = () => setTemplatesOpen(true)
    const openInsights = () => setInsightsOpen(true)
    const openActivity = () => setActivityOpen(true)
    const openSettings = () => setSettingsOpen(true)
    const openCompare = () => setCompareOpen(true)
    const openCheatsheet = () => setCheatsheetOpen(true)
    // Open a task AND pre-apply a confidence-bucket filter on its Data tab
    const openTaskWithFilter = (e: Event) => {
      const detail = (e as CustomEvent).detail as { taskId?: string; bucket?: 'high' | 'medium' | 'low' }
      if (!detail?.taskId) return
      setActiveTaskId(detail.taskId)
      setSection('task' as any)
      // dispatch the filter event after the task view mounts
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('intellex:confidence-filter', { detail }))
      }, 300)
    }
    window.addEventListener('intellex:open-templates', openTemplates)
    window.addEventListener('intellex:open-insights', openInsights)
    window.addEventListener('intellex:open-activity', openActivity)
    window.addEventListener('intellex:open-settings', openSettings)
    window.addEventListener('intellex:open-compare', openCompare)
    window.addEventListener('intellex:open-cheatsheet', openCheatsheet)
    window.addEventListener('intellex:open-task-with-filter', openTaskWithFilter)
    return () => {
      window.removeEventListener('intellex:open-templates', openTemplates)
      window.removeEventListener('intellex:open-insights', openInsights)
      window.removeEventListener('intellex:open-activity', openActivity)
      window.removeEventListener('intellex:open-settings', openSettings)
      window.removeEventListener('intellex:open-compare', openCompare)
      window.removeEventListener('intellex:open-cheatsheet', openCheatsheet)
      window.removeEventListener('intellex:open-task-with-filter', openTaskWithFilter)
    }
  }, [])

  // Refresh global counts periodically + run scheduler tick
  useEffect(() => {
    const load = () => {
      api<{ tasks: TaskListItem[] }>('/api/tasks')
        .then((d) => {
          setTaskCount(d.tasks.length)
          setRunningCount(d.tasks.filter((t) => t.status === 'running').length)
          setPinnedCount(d.tasks.filter((t) => t.pinned).length)
          setAllTasks(d.tasks)
        })
        .catch(() => {})
    }
    const loadActivity = () => {
      api<{ activities: any[] }>('/api/activity?limit=1')
        .then((d) => setActivityCount(d.activities.length))
        .catch(() => {})
    }
    const tickScheduler = () => {
      const key = process.env.NEXT_PUBLIC_SCHEDULER_KEY
      if (!key) return
      fetch(`/api/scheduler/tick?key=${encodeURIComponent(key)}`).catch(() => {})
    }
    const purgeTrash = () => {
      const key = process.env.NEXT_PUBLIC_SCHEDULER_KEY
      if (!key) return
      fetch(`/api/scheduler/purge-trash?key=${encodeURIComponent(key)}`, { method: 'POST' }).catch(() => {})
    }
    load()
    loadActivity()
    // Tasks poll every 5s (for running status); activity bell poll every 30s (less critical)
    const i = setInterval(load, 5000)
    const a = setInterval(loadActivity, 30000)
    const s = setInterval(tickScheduler, 60000) // tick scheduler every 60s
    tickScheduler() // initial
    const p = setInterval(purgeTrash, 300000) // purge trash older than 30 days every 5 min (cheap + idempotent)
    return () => {
      clearInterval(i)
      clearInterval(a)
      clearInterval(s)
      clearInterval(p)
    }
  }, [])

  const hasActiveTask = section === ('task' as any) && !!activeTaskId

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 md:px-6 md:ml-64 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 md:hidden">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-500/20">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Intellex</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Data Intelligence</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-medium text-foreground">{taskCount}</span> tasks
          {runningCount > 0 && (
            <span className="flex items-center gap-1 ml-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              <span className="text-amber-600 dark:text-amber-400 font-medium">{runningCount} running</span>
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Command palette trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-emerald-500/40 transition-colors"
          >
            <CommandIcon className="h-3.5 w-3.5" />
            <span>Quick actions</span>
            <kbd className="h-4 px-1 rounded border border-border bg-muted text-[9px] font-mono">⌘K</kbd>
          </button>
          {/* Activity bell */}
          <button
            onClick={() => setActivityOpen(true)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card hover:border-emerald-500/40 transition-colors"
            title="Activity & notifications"
          >
            <Bell className="h-4 w-4 text-muted-foreground" />
            {activityCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
            )}
          </button>
          {/* Insights */}
          <button
            onClick={() => setInsightsOpen(true)}
            className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card hover:border-emerald-500/40 transition-colors"
            title="Data quality insights"
          >
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Body: sidebar (fixed) + main (offset to make room) */}
      <div className="flex-1 flex items-start md:ml-64">
        <Sidebar section={section} onNavigate={navigate} taskCount={taskCount} runningCount={runningCount} pinnedCount={pinnedCount} />

        <main className="flex-1 min-w-0">
          <div className="px-4 md:px-6 lg:px-8 py-5 md:py-6 pb-24 md:pb-6 max-w-[1400px] w-full mx-auto">
            {section === 'dashboard' && <Dashboard onOpenTask={openTask} onNavigate={navigate} />}
            {section === 'new' && (
              <NewTask
                onCreated={openTask}
                onCancel={() => navigate('dashboard')}
                onOpenTemplates={() => setTemplatesOpen(true)}
              />
            )}
            {section === 'tasks' && <TasksList onOpenTask={openTask} onNew={() => navigate('new')} />}
            {section === ('task' as any) && activeTaskId && (
              <TaskDetailView
                taskId={activeTaskId}
                onBack={() => navigate('tasks')}
                onDelete={() => navigate('tasks')}
              />
            )}
            {section === 'datasets' && <Datasets onOpenTask={openTask} />}
            {section === 'sources' && <SourcesView onOpenTask={openTask} />}
            {section === 'history' && <HistoryView onOpenTask={openTask} onNew={() => navigate('new')} />}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl">
        <div className="flex items-center justify-around px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          {MOBILE_NAV.map((item) => {
            const active = section === item.id || (item.id === 'tasks' && section === ('task' as any))
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors',
                  active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                )}
              >
                <Icon className={cn('h-4 w-4', active && 'scale-110 transition-transform')} />
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Footer (desktop only — mobile uses the fixed bottom nav) */}
      <footer className="hidden md:block border-t border-border bg-background/60 backdrop-blur md:ml-64">
        <div className="px-4 md:px-6 lg:px-8 py-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-emerald-500 to-teal-600">
              <Brain className="h-3 w-3 text-white" />
            </div>
            <span>Intellex · AI-Powered Data Intelligence Platform</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setPaletteOpen(true)} className="hover:text-foreground transition-colors">Prompt → Plan → Collect → Clean → Export</button>
            <span className="hidden lg:inline text-muted-foreground/40">·</span>
            <button
              onClick={() => setCheatsheetOpen(true)}
              className="hidden sm:inline-flex items-center gap-1 hover:text-foreground transition-colors"
              title="Keyboard shortcuts (?)"
            >
              <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 text-[9px] font-mono">?</kbd>
              Shortcuts
            </button>
            <span className="hidden lg:inline text-muted-foreground/40">·</span>
            <span className="hidden lg:inline">v2.0 · Built with Next.js · Z.ai SDK</span>
          </div>
        </div>
      </footer>

      {/* Overlays */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        section={section}
        onNavigate={navigate}
        onNewCollection={() => navigate('new')}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenActivity={() => setActivityOpen(true)}
        onOpenCompare={() => setCompareOpen(true)}
        onOpenInsights={() => setInsightsOpen(true)}
        onOpenTemplates={() => setTemplatesOpen(true)}
        activeTaskId={activeTaskId}
        hasActiveTask={hasActiveTask}
      />
      <ActivityCenter open={activityOpen} onOpenChange={setActivityOpen} onOpenTask={openTask} />
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} onThemeChange={handleThemeChange} />
      <InsightsModal open={insightsOpen} onOpenChange={setInsightsOpen} />
      <TemplatePicker open={templatesOpen} onOpenChange={setTemplatesOpen} onUseTemplate={(prompt) => {
        // navigate to new task and prefill — use a custom event
        navigate('new')
        window.dispatchEvent(new CustomEvent('intellex:prefill-prompt', { detail: prompt }))
      }} />
      <CompareModal open={compareOpen} onOpenChange={setCompareOpen} tasks={allTasks} />
      <ShortcutCheatSheet open={cheatsheetOpen} onOpenChange={setCheatsheetOpen} />
      <OnboardingTour />
    </div>
  )
}
