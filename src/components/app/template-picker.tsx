'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sparkles, Plus, Trash2, FileText, Star } from 'lucide-react'
import { api } from './shared'

interface Template {
  id: string
  name: string
  prompt: string
  icon: string | null
  tags: string[] | null
  isBuiltIn: boolean
  useCount: number
}

interface TemplatePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUseTemplate: (prompt: string) => void
}

export function TemplatePicker({ open, onOpenChange, onUseTemplate }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    api<{ templates: Template[] }>('/api/templates')
      .then((d) => setTemplates(d.templates))
      .catch((e) => toast.error((e as Error).message || 'Failed to load templates'))
      .finally(() => setLoading(false))
  }, [open])

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/templates/${id}`, { method: 'DELETE' })
      setTemplates((t) => t.filter((x) => x.id !== id))
      toast.success('Template deleted.')
    } catch (e) {
      toast.error((e as Error).message || 'Failed to delete template')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-emerald-500" /> Prompt Templates
          </DialogTitle>
          <DialogDescription>Start a collection from a saved or built-in template</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] scrollbar-thin">
          {loading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="py-16 flex flex-col items-center text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No templates yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">Save a prompt from your tasks to reuse it later.</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="group rounded-xl border border-border bg-card hover:border-emerald-500/40 hover:shadow-sm transition-all p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-lg">
                      {t.icon || '📄'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold">{t.name}</h4>
                        {t.isBuiltIn && (
                          <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20 gap-0.5">
                            <Star className="h-2.5 w-2.5" /> built-in
                          </Badge>
                        )}
                        {t.useCount > 0 && <span className="text-[10px] text-muted-foreground">used {t.useCount}×</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 break-words">{t.prompt}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => {
                            onUseTemplate(t.prompt)
                            onOpenChange(false)
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Use template
                        </Button>
                        {!t.isBuiltIn && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-red-500"
                            onClick={() => handleDelete(t.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
