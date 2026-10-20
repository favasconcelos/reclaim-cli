import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Config } from '@/config/schema'
import type { ScanReport } from '@/core/types'
import { formatBytes } from '@/util/format'

const reportFile = (stateDir: string) => join(stateDir, 'report.json')
const pendingFile = (stateDir: string) => join(stateDir, 'pending')
const snoozeFile = (stateDir: string) => join(stateDir, 'snooze')
export const historyFile = (stateDir: string) => join(stateDir, 'history.jsonl')

export async function saveReport(stateDir: string, report: ScanReport): Promise<void> {
  await mkdir(stateDir, { recursive: true })
  await writeFile(reportFile(stateDir), `${JSON.stringify(report, null, 2)}\n`)
}

export async function loadReport(stateDir: string): Promise<ScanReport | null> {
  try {
    return JSON.parse(await readFile(reportFile(stateDir), 'utf8')) as ScanReport
  } catch {
    return null
  }
}

export async function setSnooze(stateDir: string, untilMs: number): Promise<void> {
  await mkdir(stateDir, { recursive: true })
  await writeFile(snoozeFile(stateDir), String(untilMs))
}

export async function clearSnooze(stateDir: string): Promise<void> {
  await rm(snoozeFile(stateDir), { force: true })
}

/** Epoch ms until which reminders are muted, or null when not snoozed. */
export async function activeSnooze(stateDir: string, now = Date.now()): Promise<number | null> {
  try {
    const until = Number(await readFile(snoozeFile(stateDir), 'utf8'))
    return Number.isFinite(until) && until > now ? until : null
  } catch {
    return null
  }
}

export function reminderMessage(report: ScanReport): string {
  const { staleProjects, reclaimableBytes } = report.totals
  const noun = staleProjects === 1 ? 'project' : 'projects'
  return `🧹 stale: ${formatBytes(reclaimableBytes)} reclaimable across ${staleProjects} ${noun} → run "stale review"`
}

export interface PendingResult {
  message: string | null
  reason: 'pending' | 'below-threshold' | 'snoozed'
}

/**
 * Writes (or removes) the one-line file that the shell hook prints when a terminal opens.
 * Nothing is pending when the total is under the threshold or reminders are snoozed.
 */
export async function updatePending(
  stateDir: string,
  config: Config,
  report: ScanReport,
  now = Date.now(),
): Promise<PendingResult> {
  const file = pendingFile(stateDir)
  const below = report.totals.reclaimableBytes < config.minReclaimableMB * 1_000_000
  const snoozed = (await activeSnooze(stateDir, now)) !== null

  if (below || report.totals.staleProjects === 0 || snoozed) {
    await rm(file, { force: true })
    return { message: null, reason: snoozed ? 'snoozed' : 'below-threshold' }
  }
  const message = reminderMessage(report)
  await mkdir(stateDir, { recursive: true })
  await writeFile(file, `${message}\n`)
  return { message, reason: 'pending' }
}

export async function clearPending(stateDir: string): Promise<void> {
  await rm(pendingFile(stateDir), { force: true })
}

/** Removes cleaned artifacts from a report and recomputes the totals. */
export function applyRemovals(report: ScanReport, removedPaths: ReadonlySet<string>): ScanReport {
  const projects = report.projects
    .map((project) => {
      const artifacts = project.artifacts.filter((a) => !removedPaths.has(a.path))
      if (artifacts.length === project.artifacts.length) return project
      const total = artifacts.reduce((sum, a) => sum + a.sizeBytes, 0)
      return {
        ...project,
        artifacts,
        reclaimableBytes: project.stale && !project.protectedReason ? total : 0,
      }
    })
    .filter((project) => project.artifacts.length > 0)

  const actionable = projects.filter((p) => p.stale && !p.protectedReason)
  return {
    ...report,
    projects,
    totals: {
      ...report.totals,
      staleProjects: actionable.length,
      reclaimableBytes: actionable.reduce((sum, p) => sum + p.reclaimableBytes, 0),
    },
  }
}
