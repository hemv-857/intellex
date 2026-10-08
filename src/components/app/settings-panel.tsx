'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Settings as SettingsIcon,
  Sparkles,
  Clock,
  Calendar,
  FileSpreadsheet,
  FileJson,
  FileText,
  Moon,
  Sun,
  Monitor,
  Save,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { WebhookSettings } from './webhook-settings'

type SortMode = 'relevance' | 'latest'
type DateRange = 'any' | '7d' | '30d' | '90d' | '365d'
type ExportFormat = 'csv' | 'json' | 'xlsx'
type Theme = 'light' | 'dark' | 'system'

interface Preferences {
  defaultSort?: SortMode
  defaultDateRange?: DateRange
  semanticByDefault?: boolean
  exportFormat?: ExportFormat
  autoSchedule?: boolean
  theme?: Theme
}

interface SettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onThemeChange: (theme: Theme) => void
}

const STORAGE_KEY = 'intellex.preferences'

export function SettingsPanel({ open, onOpenChange, onThemeChange }: SettingsPanelProps) {
  const [prefs, setPrefs] = useState<Preferences>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setPrefs(JSON.parse(stored))
      else
        setPrefs({
          defaultSort: 'relevance',
          defaultDateRange: 'any',
          semanticByDefault: true,
          exportFormat: 'xlsx',
          autoSchedule: false,
          theme: 'system',
        })
    } catch {
      /* ignore */
    }
  }, [])

  const update = (patch: Partial<Preferences>) => {
    setPrefs((p) => ({ ...p, ...patch }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
      if (prefs.theme) onThemeChange(prefs.theme)
      // also persist to DB singleton (best-effort)
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      }).catch(() => {})
      toast.success('Settings saved.')
      setDirty(false)
    } catch (e) {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    const defaults: Preferences = {
      defaultSort: 'relevance',
      defaultDateRange: 'any',
      semanticByDefault: true,
      exportFormat: 'xlsx',
      autoSchedule: false,
      theme: 'system',
    }
    setPrefs(defaults)
    setDirty(true)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto scrollbar-thin">
        <SheetHeader className="space-y-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            <SettingsIcon className="h-4 w-4 text-emerald-500" /> Settings
          </SheetTitle>
          <SheetDescription>Customize your workspace defaults</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Search defaults */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search &amp; Sort</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1.5 block">Default sort</Label>
                <div className="flex gap-1 rounded-lg border border-border p-0.5">
                  {([['relevance', 'Relevance', Sparkles], ['latest', 'Latest', Clock]] as const).map(([v, label, Icon]) => (
                    <button
                      key={v}
                      onClick={() => update({ defaultSort: v })}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                        (prefs.defaultSort || 'relevance') === v ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="h-3 w-3" /> {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Default date range</Label>
                <div className="grid grid-cols-5 gap-1">
                  {([
                    ['any', 'Any'],
                    ['7d', '7d'],
                    ['30d', '30d'],
                    ['90d', '90d'],
                    ['365d', '1yr'],
                  ] as const).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => update({ defaultDateRange: v })}
                      className={cn(
                        'rounded-md py-1.5 text-[11px] font-medium border transition-colors',
                        (prefs.defaultDateRange || 'any') === v ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                  <div>
                    <Label className="text-xs cursor-pointer">Semantic search by default</Label>
                    <p className="text-[10px] text-muted-foreground">AI-powered query expansion</p>
                  </div>
                </div>
                <Switch checked={prefs.semanticByDefault ?? true} onCheckedChange={(c) => update({ semanticByDefault: c })} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Export */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Export</h3>
            <div>
              <Label className="text-xs mb-1.5 block">Default export format</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  ['xlsx', 'Excel', FileSpreadsheet],
                  ['csv', 'CSV', FileText],
                  ['json', 'JSON', FileJson],
                ] as const).map(([v, label, Icon]) => (
                  <button
                    key={v}
                    onClick={() => update({ exportFormat: v })}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border py-3 text-[11px] font-medium transition-colors',
                      (prefs.exportFormat || 'xlsx') === v ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-amber-500" />
                <div>
                  <Label className="text-xs cursor-pointer">Auto-schedule new tasks</Label>
                  <p className="text-[10px] text-muted-foreground">Re-run weekly to refresh data</p>
                </div>
              </div>
              <Switch checked={prefs.autoSchedule ?? false} onCheckedChange={(c) => update({ autoSchedule: c })} />
            </div>
          </section>

          <Separator />

          {/* Theme */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Appearance</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ['light', 'Light', Sun],
                ['dark', 'Dark', Moon],
                ['system', 'System', Monitor],
              ] as const).map(([v, label, Icon]) => (
                <button
                  key={v}
                  onClick={() => {
                    update({ theme: v })
                    onThemeChange(v)
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border py-3 text-[11px] font-medium transition-colors',
                    (prefs.theme || 'system') === v ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </section>

          <Separator />

          {/* About */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">About</h3>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Platform</span><span className="text-foreground font-medium">Intellex</span></div>
              <div className="flex justify-between"><span>Version</span><span className="text-foreground font-mono">2.0.0</span></div>
              <div className="flex justify-between"><span>Engine</span><span className="text-foreground">Z.ai SDK</span></div>
              <div className="flex justify-between"><span>Database</span><span className="text-foreground">SQLite</span></div>
            </div>
            <button
              onClick={() => {
                try { localStorage.removeItem('intellex.onboarding.v1') } catch {}
                window.location.reload()
              }}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" /> Replay onboarding tour
            </button>
          </section>
        </div>

        {/* Sticky save bar */}
        <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Separator />

          {/* Automatic backup and failure alerts */}
          <WebhookSettings />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { STORAGE_KEY }
export type { Preferences, SortMode, DateRange, ExportFormat, Theme }
