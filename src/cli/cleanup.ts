import type { Context } from '@/cli/context'
import { renderResult } from '@/cli/render'
import { buildPlan, executePlan } from '@/core/execute'
import { applyRemovals, historyFile, saveReport, updatePending } from '@/core/state'
import type { ProjectReport, ScanReport } from '@/core/types'
import { c, formatBytes } from '@/util/format'

/** Removes the artifacts of the given projects and refreshes stored state. */
export async function runCleanup(
  ctx: Context,
  report: ScanReport,
  projects: readonly ProjectReport[],
  options: { dryRun: boolean },
): Promise<{ reclaimedBytes: number; failures: number }> {
  const plan = buildPlan(projects)
  const results = await executePlan(plan, {
    dryRun: options.dryRun,
    historyFile: historyFile(ctx.paths.stateDir),
    onResult: (result) => console.log(renderResult(result)),
  })

  const removed = results.filter((r) => r.outcome.status === 'removed')
  const reclaimedBytes = removed.reduce(
    (sum, r) => sum + (r.outcome.status === 'removed' ? r.outcome.bytes : 0),
    0,
  )
  const failures = results.filter((r) => r.outcome.status === 'failed').length

  if (options.dryRun) {
    console.log(`\n${c.cyan('Dry run:')} ${formatBytes(plan.totalBytes)} would be reclaimed.`)
  } else {
    console.log(`\n${c.green('Reclaimed')} ${c.bold(formatBytes(reclaimedBytes))}.`)
    const updated = applyRemovals(report, new Set(removed.map((r) => r.item.artifact.path)))
    await saveReport(ctx.paths.stateDir, updated)
    await updatePending(ctx.paths.stateDir, ctx.config, updated)
  }
  return { reclaimedBytes, failures }
}
