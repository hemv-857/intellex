import fs from 'node:fs'
import path from 'node:path'

// The Z.AI SDK reads its credentials from a JSON file — `.z-ai-config` in the
// project, home directory, or /etc — and has no environment-variable support.
// That works on a laptop and breaks on every deploy, where there is no such file
// and no way to create one ahead of boot.
//
// So: if ZAI_API_KEY (and optionally ZAI_BASE_URL) are set in the environment and
// the file is missing, write it at boot with 0600. On a dev machine with a real
// config file this never runs.

const CONFIG_NAME = '.z-ai-config'

function configExists(): boolean {
  for (const dir of [process.cwd(), process.env.HOME || '', '/etc']) {
    if (!dir) continue
    try {
      const raw = fs.readFileSync(path.join(dir, CONFIG_NAME), 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed?.baseUrl && parsed?.apiKey) return true
    } catch {
      // absent or unreadable — keep looking
    }
  }
  return false
}

export function ensureZaiConfig(): { created: boolean; reason?: string } {
  const apiKey = process.env.ZAI_API_KEY
  const baseUrl = process.env.ZAI_BASE_URL

  if (!apiKey || !baseUrl) {
    return {
      created: false,
      reason: !apiKey ? 'ZAI_API_KEY not set' : 'ZAI_BASE_URL not set',
    }
  }
  if (configExists()) return { created: false }

  const payload = JSON.stringify({ baseUrl, apiKey }, null, 2)
  // Write to both places the SDK looks. The standalone server's cwd is
  // .next/standalone, which every build wipes, so the home-directory copy is
  // what makes this survive a redeploy. 0600: the file holds a live credential.
  const targets = new Set<string>([path.join(process.cwd(), CONFIG_NAME)])
  if (process.env.HOME) targets.add(path.join(process.env.HOME, CONFIG_NAME))

  let written = 0
  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, payload, { mode: 0o600 })
      try {
        fs.chmodSync(target, 0o600)
      } catch {
        // chmod is best-effort; some filesystems refuse it
      }
      written++
    } catch (e) {
      console.warn(`[zai] could not write ${target}`, (e as Error).message)
    }
  }
  return { created: written > 0 }
}