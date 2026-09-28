'use client'

import { useEffect } from 'react'

type Section = 'dashboard' | 'new' | 'tasks' | 'datasets' | 'sources' | 'history'

interface ShortcutHandlers {
  onNavigate: (s: Section) => void
  onNewCollection: () => void
  onOpenCommandPalette: () => void
  onOpenSettings: () => void
  onOpenActivity: () => void
  onOpenTemplates: () => void
  onOpenInsights: () => void
  onToggleTheme: () => void
}

export function useKeyboardShortcuts(h: ShortcutHandlers) {
  useEffect(() => {
    let lastG = 0
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.tagName === 'SELECT')

      // Cmd/Ctrl+K — command palette (works even when typing)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        h.onOpenCommandPalette()
        return
      }

      if (isTyping) return

      // 'g' prefix (vim-style) then a key
      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        lastG = Date.now()
        return
      }
      const isGPrefix = Date.now() - lastG < 700

      const k = e.key.toLowerCase()
      if (isGPrefix) {
        if (k === 'd') { e.preventDefault(); h.onNavigate('dashboard'); lastG = 0 }
        else if (k === 'n') { e.preventDefault(); h.onNewCollection(); lastG = 0 }
        else if (k === 't') { e.preventDefault(); h.onNavigate('tasks'); lastG = 0 }
        else if (k === 'a') { e.preventDefault(); h.onNavigate('datasets'); lastG = 0 } // 'a' for dAta
        else if (k === 's') { e.preventDefault(); h.onNavigate('sources'); lastG = 0 }
        else if (k === 'h') { e.preventDefault(); h.onNavigate('history'); lastG = 0 }
        return
      }

      // Single-key shortcuts
      if (k === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); h.onNewCollection() }
      else if (k === ',') { e.preventDefault(); h.onOpenSettings() }
      else if (k === 'b') { e.preventDefault(); h.onOpenActivity() }
      else if (k === 'p') { e.preventDefault(); h.onOpenTemplates() }
      else if (k === 'i') { e.preventDefault(); h.onOpenInsights() }
      else if (k === '?') { e.preventDefault(); h.onOpenCommandPalette() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [h])
}
