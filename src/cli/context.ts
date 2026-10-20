import type { Config } from '@/config/schema'
import { loadConfig } from '@/config/store'
import { scan } from '@/core/scan'
import { type PendingResult, saveReport, updatePending } from '@/core/state'
import type { ProjectType, ScanReport } from '@/core/types'
import { getPlatform, type Platform } from '@/platform'
import { selectProjectTypes } from '@/types'

export interface Context {
  platform: Platform
  paths: Platform['paths']
  config: Config
  types: ProjectType[]
}

export async function createContext(): Promise<Context> {
  const platform = getPlatform()
  const config = await loadConfig(platform.paths.configDir)
  return { platform, paths: platform.paths, config, types: selectProjectTypes(config.types) }
}

export interface ScanAndStoreOptions {
  includeActive?: boolean
  onProgress?: (message: string) => void
}

/** Scans, persists the report, and refreshes the terminal reminder. */
export async function scanAndStore(
  ctx: Context,
  options: ScanAndStoreOptions = {},
): Promise<{ report: ScanReport; pending: PendingResult }> {
  const report = await scan({
    config: ctx.config,
    types: ctx.types,
    includeActive: options.includeActive,
    onProgress: options.onProgress,
  })
  await saveReport(ctx.paths.stateDir, report)
  const pending = await updatePending(ctx.paths.stateDir, ctx.config, report)
  return { report, pending }
}
