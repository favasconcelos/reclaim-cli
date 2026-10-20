import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { isHeavyDir, readEntries } from '@/core/fs'

const MAX_FILES = 100_000

async function mtimeOf(path: string): Promise<number | null> {
  try {
    return (await lstat(path)).mtimeMs
  } catch {
    return null
  }
}

export interface ActivityOptions {
  /** Absolute paths (artifacts) that must not count as activity. */
  exclude?: readonly string[]
  /** Stop as soon as any activity newer than this (ms epoch) is found. */
  earlyExitAfter?: number
  /** Last commit time, if known. */
  lastCommitMs?: number | null
}

/**
 * Most recent sign of life in a project: the newest source-file mtime, the last
 * commit, or the last git HEAD/index change (pull, checkout, commit).
 */
export async function lastActivity(root: string, options: ActivityOptions = {}): Promise<number> {
  const exclude = new Set(options.exclude ?? [])
  const cutoff = options.earlyExitAfter ?? Number.POSITIVE_INFINITY
  let newest = options.lastCommitMs ?? 0

  for (const name of ['HEAD', 'index']) {
    const m = await mtimeOf(join(root, '.git', name))
    if (m !== null && m > newest) newest = m
  }
  if (newest > cutoff) return newest

  let visited = 0
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    for (const entry of await readEntries(dir)) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (isHeavyDir(entry.name) || exclude.has(full)) continue
        stack.push(full)
        continue
      }
      if (entry.name === '.DS_Store') continue
      const m = await mtimeOf(full)
      if (m !== null && m > newest) {
        newest = m
        if (newest > cutoff) return newest
      }
      if (++visited >= MAX_FILES) return newest
    }
  }

  return newest > 0 ? newest : ((await mtimeOf(root)) ?? 0)
}
