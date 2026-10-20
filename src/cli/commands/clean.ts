import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { runCleanup } from '@/cli/cleanup'
import { createContext, scanAndStore } from '@/cli/context'
import type { ProjectReport } from '@/core/types'
import { StaleError } from '@/util/errors'
import { c, formatBytes, formatIdle } from '@/util/format'
import { isInside, tildify } from '@/util/path'

export interface CleanFlags {
  dryRun?: boolean
  yes?: boolean
}

export async function cleanCommand(paths: string[], flags: CleanFlags): Promise<void> {
  const ctx = await createContext()
  if (ctx.config.roots.length === 0) {
    throw new StaleError('No folders to watch yet. Run `stale init` or `stale add <folder>`.')
  }

  const { report } = await scanAndStore(ctx)
  const filters = paths.map((path) => resolve(path))
  const projects = report.projects.filter(
    (project) =>
      project.stale &&
      !project.protectedReason &&
      (filters.length === 0 ||
        filters.some((f) => project.path === f || isInside(project.path, f))),
  )

  if (projects.length === 0) {
    console.log(c.green('Nothing to clean up.'))
    return
  }

  const total = projects.reduce((sum, project) => sum + project.reclaimableBytes, 0)
  if (!flags.dryRun && !flags.yes) {
    console.log(describe(projects))
    const ok = await p.confirm({
      message: `Remove build artifacts from ${projects.length} project(s) and reclaim ${formatBytes(total)}?`,
    })
    if (p.isCancel(ok) || !ok) {
      console.log('Cancelled.')
      return
    }
  }

  const { failures } = await runCleanup(ctx, report, projects, { dryRun: flags.dryRun ?? false })
  if (failures > 0) process.exitCode = 1
}

function describe(projects: readonly ProjectReport[]): string {
  return projects
    .map(
      (project) =>
        `  ${tildify(project.path)} ${c.dim(`idle ${formatIdle(project.idleDays)} · ${formatBytes(project.reclaimableBytes)}`)}`,
    )
    .join('\n')
}
