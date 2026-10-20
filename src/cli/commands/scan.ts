import * as p from '@clack/prompts'
import { createContext, scanAndStore } from '@/cli/context'
import { renderReport } from '@/cli/render'
import { ReclaimError } from '@/util/errors'
import { c } from '@/util/format'

export interface ScanFlags {
  json?: boolean
  quiet?: boolean
  notify?: boolean
  all?: boolean
}

export async function scanCommand(flags: ScanFlags): Promise<void> {
  const ctx = await createContext()
  if (ctx.config.roots.length === 0) {
    throw new ReclaimError(
      'No folders to watch yet. Run `reclaim-cli init` or `reclaim-cli add <folder>`.',
    )
  }

  const interactive = process.stdout.isTTY && !flags.json && !flags.quiet
  const spinner = interactive ? p.spinner() : null
  spinner?.start('Scanning projects…')
  const { report, pending } = await scanAndStore(ctx, { includeActive: flags.all })
  spinner?.stop('Scan complete')

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2))
  } else if (!flags.quiet) {
    console.log(renderReport(report, { all: flags.all }))
    if (pending.reason === 'snoozed') console.log(c.dim('Reminders are snoozed.'))
  }

  if (flags.notify && ctx.config.notify && pending.message) {
    try {
      await ctx.platform.notifier.notify({
        title: 'reclaim-cli',
        message: pending.message.replace(/^🧹 reclaim-cli: /, ''),
      })
    } catch (error) {
      console.error(
        `${c.yellow('warning:')} could not send the notification (${(error as Error).message})`,
      )
    }
  }
}
