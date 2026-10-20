import { readFile } from 'node:fs/promises'
import { createContext } from '@/cli/context'
import { historyFile } from '@/core/state'
import { c, formatBytes } from '@/util/format'
import { tildify } from '@/util/path'

export async function logCommand(flags: { limit?: string }): Promise<void> {
  const ctx = await createContext()
  let raw = ''
  try {
    raw = await readFile(historyFile(ctx.paths.stateDir), 'utf8')
  } catch {
    console.log('No cleanups yet.')
    return
  }
  const limit = Number(flags.limit ?? 20)
  const entries = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { at: string; path: string; label: string; bytes: number })
  for (const entry of entries.slice(-limit)) {
    console.log(
      `${c.dim(entry.at.slice(0, 16).replace('T', ' '))}  ${formatBytes(entry.bytes).padStart(8)}  ${tildify(entry.path)}`,
    )
  }
  const total = entries.reduce((sum, e) => sum + e.bytes, 0)
  console.log(`\n${entries.length} removals, ${c.bold(formatBytes(total))} reclaimed in total.`)
}
