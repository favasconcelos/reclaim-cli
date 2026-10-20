import * as p from '@clack/prompts'
import { runCleanup } from '@/cli/cleanup'
import { createContext, scanAndStore } from '@/cli/context'
import { ReclaimError } from '@/util/errors'
import { c, formatBytes, formatIdle } from '@/util/format'
import { tildify } from '@/util/path'

export async function reviewCommand(): Promise<void> {
  const ctx = await createContext()
  if (ctx.config.roots.length === 0) {
    throw new ReclaimError(
      'No folders to watch yet. Run `reclaim-cli init` or `reclaim-cli add <folder>`.',
    )
  }

  p.intro(c.bold('reclaim-cli review'))
  const spinner = p.spinner()
  spinner.start('Scanning projects…')
  const { report } = await scanAndStore(ctx)
  spinner.stop('Scan complete')

  const candidates = report.projects
    .filter((project) => project.stale && !project.protectedReason)
    .sort((a, b) => b.reclaimableBytes - a.reclaimableBytes)
  const protectedProjects = report.projects.filter(
    (project) => project.stale && project.protectedReason,
  )

  if (protectedProjects.length > 0) {
    p.log.warn(
      `Skipping ${protectedProjects.length} stale project(s) that need attention:\n` +
        protectedProjects.map((x) => `  ${tildify(x.path)} (${x.protectedReason})`).join('\n'),
    )
  }
  if (candidates.length === 0) {
    p.outro(c.green('Nothing to clean up.'))
    return
  }

  const selected = await p.multiselect({
    message: `Stale projects (idle > ${report.staleAfterDays} days). Space to select, a to toggle all.`,
    required: false,
    options: candidates.map((project) => ({
      value: project.path,
      label: `${tildify(project.path)}  ${c.bold(formatBytes(project.reclaimableBytes))}`,
      hint: `idle ${formatIdle(project.idleDays)} · ${project.artifacts.map((a) => a.label).join(', ')}`,
    })),
  })
  if (p.isCancel(selected) || selected.length === 0) {
    p.outro('Nothing removed.')
    return
  }

  const chosen = candidates.filter((project) => selected.includes(project.path))
  const total = chosen.reduce((sum, project) => sum + project.reclaimableBytes, 0)
  const ok = await p.confirm({
    message: `Delete build artifacts from ${chosen.length} project(s) and reclaim ${formatBytes(total)}? Source files are not touched.`,
  })
  if (p.isCancel(ok) || !ok) {
    p.outro('Nothing removed.')
    return
  }

  const { failures } = await runCleanup(ctx, report, chosen, { dryRun: false })
  if (failures > 0) process.exitCode = 1
  p.outro('Done.')
}
