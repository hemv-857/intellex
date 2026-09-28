'use client'

import { useEffect } from 'react'
import { Brain, RotateCcw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
        <AlertTriangle className="h-7 w-7 text-red-500" />
      </div>
      <div className="text-center space-y-1.5 max-w-md">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred while rendering this page. You can try again — your data is safe.
        </p>
        {error?.message && (
          <pre className="mt-3 text-[11px] text-red-500/80 bg-red-500/5 border border-red-500/20 rounded-md p-2 overflow-x-auto text-left">
            {error.message}
          </pre>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.location.href = '/'}>
          <RotateCcw className="h-4 w-4 mr-1.5" /> Reload app
        </Button>
        <Button onClick={reset} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          Try again
        </Button>
      </div>
      <div className="flex items-center gap-1.5 mt-6 text-xs text-muted-foreground">
        <Brain className="h-3.5 w-3.5 text-emerald-500" />
        Intellex · AI Data Intelligence Platform
      </div>
    </div>
  )
}
