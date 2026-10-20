import { realpathSync } from 'node:fs'
import { createContext } from '@/cli/context'
import { StaleError } from '@/util/errors'
import { c } from '@/util/format'

export function dailyCommand(): string[] {
  const script = process.argv[1]
  if (!script) throw new StaleError('Cannot determine the path of the stale executable.')
  return [process.execPath, realpathSync(script), 'scan', '--notify', '--quiet']
}

export async function scheduleInstallCommand(flags: { at?: string }): Promise<void> {
  const ctx = await createContext()
  const at = flags.at ?? ctx.config.scheduleAt
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at))
    throw new StaleError(`Invalid time "${at}". Use HH:mm (24h).`)

  await ctx.platform.scheduler.install({ at, command: dailyCommand(), logDir: ctx.paths.stateDir })
  console.log(`${c.green('✔')} Daily scan scheduled at ${at}.`)
  console.log(c.dim('macOS may ask you to allow notifications the first time one is shown.'))
}

export async function scheduleUninstallCommand(): Promise<void> {
  const ctx = await createContext()
  const removed = await ctx.platform.scheduler.uninstall()
  console.log(removed ? `${c.green('✔')} Daily scan removed.` : 'No daily scan was installed.')
}

export async function scheduleStatusCommand(): Promise<void> {
  const ctx = await createContext()
  const status = await ctx.platform.scheduler.status()
  if (!status.installed) {
    console.log('Not installed. Run `stale schedule install`.')
    return
  }
  console.log(
    `Installed${status.loaded ? ' and loaded' : ' (not loaded)'}, runs daily at ${status.at ?? '?'}`,
  )
  if (status.command) console.log(c.dim(status.command.join(' ')))
  for (const problem of status.problems) console.log(`${c.yellow('!')} ${problem}`)
  if (status.problems.length > 0) process.exitCode = 1
}
