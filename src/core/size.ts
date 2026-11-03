import type { Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { run } from '@/util/exec'

/** Pure-Node recursive size (file bytes). Used when `du` is unavailable (Windows). */
export async function sizeOfTree(path: string): Promise<number> {
  let total = 0
  async function visit(dir: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      try {
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) await visit(full)
        else if (entry.isFile()) total += (await stat(full)).size
      } catch {
        // Unreadable entries contribute nothing.
      }
    }
  }
  try {
    const info = await stat(path)
    if (info.isFile()) return info.size
  } catch {
    return 0
  }
  await visit(path)
  return total
}

/**
 * Disk usage in bytes (allocated blocks where `du` exists, file bytes otherwise).
 * `du -sk` covers macOS and Linux; Windows falls back to a recursive walk.
 */
export async function sizeOf(path: string): Promise<number> {
  if (process.platform !== 'win32') {
    const result = await run('du', ['-sk', path], { timeoutMs: 300_000 })
    const kb = Number.parseInt(result.stdout.split(/\s+/)[0] ?? '', 10)
    if (result.ok && Number.isFinite(kb)) return kb * 1024
    if (result.ok) return 0
    // `du` missing or failed: fall through to the portable walk.
  }
  return sizeOfTree(path)
}
