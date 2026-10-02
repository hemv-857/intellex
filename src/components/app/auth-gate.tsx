'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Loader2, LogOut, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Wraps the app. Renders nothing but a spinner until we know whether the
// browser holds a valid session, so no component ever fires an unauthenticated
// request. When APP_TOKEN is unset the API is disabled entirely and we say so
// rather than showing a login box that cannot work.

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'authed' | 'anon' | 'disabled'>('checking')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (data.authDisabled) return setState('disabled')
      setState(data.authenticated ? 'authed' : 'anon')
    } catch {
      setState('anon')
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) return setState('authed')
      setError((await res.json().catch(() => ({}))).error || 'Sign-in failed')
    } catch {
      setError('Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-label="Checking session" />
      </div>
    )
  }

  if (state === 'authed') return <>{children}</>

  if (state === 'disabled') {
    return (
      <Shell>
        <ShieldAlert className="h-6 w-6 text-amber-500" />
        <h1 className="text-lg font-semibold">Authentication not configured</h1>
        <p className="text-sm text-muted-foreground">
          Set <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">APP_TOKEN</code> in
          your <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code> and restart.
          While it is unset the API is disabled on purpose.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <KeyRound className="h-6 w-6 text-emerald-600" />
      <h1 className="text-lg font-semibold">Sign in to Intellex</h1>
      <form onSubmit={signIn} className="flex w-full max-w-xs flex-col gap-3">
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Access token"
          aria-label="Access token"
          autoFocus
        />
        <Button type="submit" disabled={busy || !token}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
      <p className="text-xs text-muted-foreground">
        The token is your <code className="font-mono">APP_TOKEN</code>. It is exchanged for an
        httpOnly cookie and never stored in JavaScript.
      </p>
    </Shell>
  )
}

function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' })
        location.reload()
      }}
    >
      <LogOut className="h-4 w-4" /> Sign out
    </Button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center shadow-sm">
        {children}
      </div>
    </div>
  )
}

export { SignOutButton }