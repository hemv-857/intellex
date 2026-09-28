import Link from 'next/link'
import { Compass, Brain } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
        <Compass className="h-7 w-7 text-emerald-500" />
      </div>
      <div className="text-center space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight">404</h1>
        <p className="text-sm text-muted-foreground">This page doesn&apos;t exist or has been moved.</p>
      </div>
      <Link href="/">
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Brain className="h-4 w-4 mr-1.5" /> Back to Intellex
        </Button>
      </Link>
    </div>
  )
}
