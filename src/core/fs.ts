import type { Dirent } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Directories that are never descended into when searching inside a project. */
const HEAVY_DIRS = new Set([
  'node_modules',
  '.git',
  '.build',
  '.swiftpm',
  'Pods',
  'Carthage',
  'build',
  'dist',
  'out',
  'coverage',
  '.gradle',
  '.cxx',
  '.next',
  '.nuxt',
  '.turbo',
  '.svelte-kit',
  '.parcel-cache',
  'DerivedData',
])

export function isHeavyDir(name: string): boolean {
  return HEAVY_DIRS.has(name)
}

/** An existing real directory (symlinks are deliberately not followed). */
export async function isRealDirectory(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory()
  } catch {
    return false
  }
}

export async function readEntries(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * Finds directories under `root` (including `root`) whose entry names satisfy `match`.
 * Heavy and hidden directories are skipped.
 */
export async function findDirsWith(
  root: string,
  match: (entries: readonly string[]) => boolean,
  maxDepth: number,
): Promise<string[]> {
  const found: string[] = []
  const visit = async (dir: string, depth: number): Promise<void> => {
    const entries = await readEntries(dir)
    if (match(entries.map((e) => e.name))) found.push(dir)
    if (depth >= maxDepth) return
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || isHeavyDir(entry.name)) continue
      await visit(join(dir, entry.name), depth + 1)
    }
  }
  await visit(root, 0)
  return found
}
