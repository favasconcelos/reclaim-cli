import { appendFile, lstat, mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import type { ArtifactReport, ProjectReport } from '@/core/types'
import { isInside } from '@/util/path'

export interface PlanItem {
  projectPath: string
  projectName: string
  artifact: ArtifactReport
}

export interface CleanPlan {
  items: PlanItem[]
  totalBytes: number
}

export type ItemOutcome =
  | { status: 'removed'; bytes: number }
  | { status: 'dry-run'; bytes: number }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string }

export interface ExecutionResult {
  item: PlanItem
  outcome: ItemOutcome
}

export interface ExecuteOptions {
  dryRun?: boolean
  historyFile?: string
  now?: number
  onResult?: (result: ExecutionResult) => void
}

/** Turns scanned projects into a list of removals. Pure: touches nothing. */
export function buildPlan(projects: readonly ProjectReport[]): CleanPlan {
  const items: PlanItem[] = []
  for (const project of projects) {
    for (const artifact of project.artifacts) {
      items.push({ projectPath: project.path, projectName: project.name, artifact })
    }
  }
  return { items, totalBytes: items.reduce((sum, i) => sum + i.artifact.sizeBytes, 0) }
}

/** Reason the path must not be removed, or null when it is safe. */
export function removalBlocker(path: string, scope: string): string | null {
  const target = resolve(path)
  const boundary = resolve(scope)
  if (target === '/' || target === resolve(homedir())) return 'refusing to remove a protected path'
  if (!isInside(target, boundary)) return `path is outside its allowed scope (${boundary})`
  return null
}

export async function executePlan(
  plan: CleanPlan,
  options: ExecuteOptions = {},
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = []
  const now = options.now ?? Date.now()

  for (const item of plan.items) {
    const outcome = await removeOne(item, options.dryRun ?? false)
    const result = { item, outcome }
    results.push(result)
    options.onResult?.(result)

    if (outcome.status === 'removed' && options.historyFile) {
      await mkdir(dirname(options.historyFile), { recursive: true })
      const entry = {
        at: new Date(now).toISOString(),
        project: item.projectPath,
        path: item.artifact.path,
        label: item.artifact.label,
        bytes: outcome.bytes,
      }
      await appendFile(options.historyFile, `${JSON.stringify(entry)}\n`)
    }
  }
  return results
}

async function removeOne(item: PlanItem, dryRun: boolean): Promise<ItemOutcome> {
  const { path, scope, sizeBytes } = item.artifact
  const blocker = removalBlocker(path, scope)
  if (blocker) return { status: 'skipped', reason: blocker }

  let info: Awaited<ReturnType<typeof lstat>>
  try {
    info = await lstat(path)
  } catch {
    return { status: 'skipped', reason: 'already gone' }
  }
  if (info.isSymbolicLink()) return { status: 'skipped', reason: 'is a symlink' }
  if (!info.isDirectory()) return { status: 'skipped', reason: 'not a directory' }

  if (dryRun) return { status: 'dry-run', bytes: sizeBytes }
  try {
    await rm(path, { recursive: true, force: true })
    return { status: 'removed', bytes: sizeBytes }
  } catch (error) {
    return { status: 'failed', reason: (error as Error).message }
  }
}
