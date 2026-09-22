'use client'

import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Sparkles,
  ListChecks,
  Database,
  Globe,
  History,
  Brain,
  Github,
  Activity,
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
import { api, type TaskListItem, type TaskStatus } from '@/components/app/shared'
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

  const openTask = (id: string) => {
    setActiveTaskId(id)
    setSection('task' as any)
  }

  const navigate = (s: Section) => {
    setSection(s)
    if (s !== ('task' as any)) setActiveTaskId(null)
  }

  // refresh global counts periodically
  useEffect(() => {
    const load = () => {
      api<{ tasks: TaskListItem[] }>('/api/tasks')
        .then((d) => {
          setTaskCount(d.tasks.length)
          setRunningCount(d.tasks.filter((t) => t.status === 'running').length)
        })
        .catch(() => {})
    }
    load()
    const i = setInterval(load, 5000)
    return () => clearInterval(i)
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 md:px-6 backdrop-blur-xl">
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
          <a
            href="https://z.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-emerald-500/40 transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
            Powered by Z.ai
          </a>
          <ThemeToggle />
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex-1 flex min-h-0">
        <Sidebar section={section} onNavigate={navigate} taskCount={taskCount} runningCount={runningCount} />

        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 px-4 md:px-6 lg:px-8 py-5 md:py-6 pb-20 md:pb-6 max-w-[1400px] w-full mx-auto">
            {section === 'dashboard' && <Dashboard onOpenTask={openTask} onNavigate={navigate} />}
            {section === 'new' && <NewTask onCreated={openTask} onCancel={() => navigate('dashboard')} />}
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

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-background/60 backdrop-blur">
        <div className="px-4 md:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-emerald-500 to-teal-600">
              <Brain className="h-3 w-3 text-white" />
            </div>
            <span>Intellex · AI-Powered Data Intelligence Platform</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Prompt → Plan → Collect → Clean → Export</span>
            <span className="hidden sm:inline text-muted-foreground/40">·</span>
            <span className="hidden sm:inline">Built with Next.js · Z.ai SDK</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
