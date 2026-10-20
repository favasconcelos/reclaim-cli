import { Command } from 'commander'
import { cleanCommand } from '@/cli/commands/clean'
import { completionCommand } from '@/cli/commands/completion'
import { configGetCommand, configSetCommand } from '@/cli/commands/config'
import { addCommand, ignoreCommand, removeCommand } from '@/cli/commands/folders'
import { hookInstallCommand, hookPrintCommand } from '@/cli/commands/hook'
import { initCommand } from '@/cli/commands/init'
import { logCommand } from '@/cli/commands/log'
import { reviewCommand } from '@/cli/commands/review'
import { scanCommand } from '@/cli/commands/scan'
import {
  scheduleInstallCommand,
  scheduleStatusCommand,
  scheduleUninstallCommand,
} from '@/cli/commands/schedule'
import { snoozeCommand } from '@/cli/commands/snooze'
import { defaultHints } from '@/completion/hints'
import { generateZshCompletion } from '@/completion/zsh'
import { ReclaimError } from '@/util/errors'
import { c } from '@/util/format'
import pkg from '../package.json' with { type: 'json' }

/** Builds the command tree without running it, so it can also be inspected (completion, tests). */
export function buildProgram(): Command {
  const program = new Command()
  program
    .name('reclaim-cli')
    .description('Find projects you have not touched in a while and reclaim their disk space.')
    .version(pkg.version)

  const hints = defaultHints()
  // Generated lazily so the script always reflects the commands registered below.
  const completion = () => generateZshCompletion(program, hints)

  /** Wraps an action so expected failures print a clean message instead of a stack trace. */
  function action<A extends unknown[]>(fn: (...args: A) => Promise<void> | void) {
    return async (...args: A) => {
      try {
        await fn(...args)
      } catch (error) {
        if (error instanceof ReclaimError) {
          console.error(`${c.red('error:')} ${error.message}`)
        } else {
          console.error(error)
        }
        process.exitCode = 1
      }
    }
  }

  program
    .command('init')
    .description('interactive setup: folders, thresholds, schedule, terminal hook')
    .action(action(() => initCommand(completion())))

  program
    .command('add <folder>')
    .description('watch a folder for projects')
    .action(action(addCommand))
  program
    .command('remove <folder>')
    .description('stop watching a folder')
    .action(action(removeCommand))
  program
    .command('ignore <path>')
    .description('never report projects at or below this path')
    .option('--remove', 'remove the path from the ignore list')
    .action(action(ignoreCommand))

  program
    .command('scan')
    .description('scan now and show stale projects')
    .option('--json', 'print the report as JSON')
    .option('--quiet', 'print nothing')
    .option('--notify', 'send a notification when there is something to clean')
    .option('--all', 'include active projects too')
    .action(action(scanCommand))

  program
    .command('review')
    .description('pick stale projects to clean up interactively')
    .action(action(reviewCommand))

  program
    .command('clean [paths...]')
    .description('remove build artifacts from stale projects')
    .option('--dry-run', 'show what would be removed')
    .option('-y, --yes', 'do not ask for confirmation')
    .action(action(cleanCommand))

  const schedule = program.command('schedule').description('manage the daily background scan')
  schedule
    .command('install')
    .description('install or update the daily scan')
    .option('--at <HH:mm>', 'time of day (default: from config)')
    .action(action(scheduleInstallCommand))
  schedule
    .command('uninstall')
    .description('remove the daily scan')
    .action(action(scheduleUninstallCommand))
  schedule
    .command('status')
    .description('show whether the daily scan is healthy')
    .action(action(scheduleStatusCommand))

  const hook = program.command('hook').description('terminal reminder for new shells (zsh)')
  hook
    .command('install')
    .description('write the hook script and source it from your shell rc file')
    .action(action(() => hookInstallCommand(completion())))
  hook
    .command('print')
    .description('print the hook script to stdout')
    .action(action(() => hookPrintCommand(completion())))

  program
    .command('snooze [duration]')
    .description('mute reminders for a while, e.g. 3d, 12h')
    .option('--clear', 'resume reminders')
    .action(action(snoozeCommand))

  program
    .command('log')
    .description('history of removed artifacts')
    .option('-n, --limit <count>', 'entries to show', '20')
    .action(action(logCommand))

  const config = program.command('config').description('view or change settings')
  config
    .command('get [key]')
    .description('print one setting or all')
    .action(action(configGetCommand))
  config
    .command('set <key> <value>')
    .description('change a setting')
    .action(action(configSetCommand))

  program
    .command('completion <shell>')
    .description('print the shell completion script (zsh)')
    .action(action((shell: string) => completionCommand(shell, program, hints)))

  return program
}
