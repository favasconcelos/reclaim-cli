import type { ExecutionResult } from '@/core/execute'
import type { ProjectReport, ScanReport } from '@/core/types'
import { c, formatBytes, formatIdle } from '@/util/format'
import { tildify } from '@/util/path'

const pad = (value: string, width: number) => value.padEnd(width)

function describeProject(project: ProjectReport): string {
  if (project.protectedReason) return c.yellow(`skipped: ${project.protectedReason}`)
  const labels = project.artifacts.map((a) => a.label)
  const shown = labels.slice(0, 3).join(', ')
  return labels.length > 3 ? `${shown} +${labels.length - 3} more` : shown
}

export function renderReport(report: ScanReport, options: { all?: boolean } = {}): string {
  const rows = report.projects
    .filter((p) => options.all || p.stale)
    .sort((a, b) => Number(b.stale) - Number(a.stale) || b.reclaimableBytes - a.reclaimableBytes)

  const { staleProjects, reclaimableBytes, projectsScanned } = report.totals
  const lines: string[] = []

  if (rows.length === 0) {
    lines.push(
      c.green(`Nothing to clean up.`) +
        c.dim(` (${projectsScanned} projects scanned, stale after ${report.staleAfterDays} days)`),
    )
    return lines.join('\n')
  }

  const widths = {
    path: Math.max(7, ...rows.map((r) => tildify(r.path).length)),
    types: Math.max(5, ...rows.map((r) => r.types.join(',').length)),
    idle: 5,
    size: Math.max(4, ...rows.map((r) => formatBytes(r.reclaimableBytes || sum(r)).length)),
  }

  lines.push(
    c.dim(
      `${pad('PROJECT', widths.path)}  ${pad('TYPE', widths.types)}  ${pad('IDLE', widths.idle)}  ${pad('SIZE', widths.size)}  CLEANABLE`,
    ),
  )
  for (const project of rows) {
    const size = formatBytes(project.reclaimableBytes || sum(project))
    const idle = project.stale
      ? c.yellow(pad(formatIdle(project.idleDays), widths.idle))
      : c.green(pad(formatIdle(project.idleDays), widths.idle))
    lines.push(
      `${pad(tildify(project.path), widths.path)}  ${pad(project.types.join(','), widths.types)}  ${idle}  ${pad(size, widths.size)}  ${describeProject(project)}`,
    )
  }

  lines.push('')
  lines.push(
    `${c.bold(String(staleProjects))} stale ${staleProjects === 1 ? 'project' : 'projects'}, ` +
      `${c.bold(formatBytes(reclaimableBytes))} reclaimable ` +
      c.dim(`(${projectsScanned} scanned, stale after ${report.staleAfterDays} days)`),
  )
  return lines.join('\n')
}

const sum = (project: ProjectReport) => project.artifacts.reduce((s, a) => s + a.sizeBytes, 0)

export function renderResult({ item, outcome }: ExecutionResult): string {
  const where = `${tildify(item.projectPath)} ${c.dim(item.artifact.label)}`
  switch (outcome.status) {
    case 'removed':
      return `${c.green('✔')} ${where} ${c.dim(`(${formatBytes(outcome.bytes)})`)}`
    case 'dry-run':
      return `${c.cyan('○')} would remove ${where} ${c.dim(`(${formatBytes(outcome.bytes)})`)}`
    case 'skipped':
      return `${c.yellow('–')} ${where} ${c.dim(`skipped: ${outcome.reason}`)}`
    case 'failed':
      return `${c.red('✖')} ${where} ${c.red(outcome.reason)}`
  }
}
