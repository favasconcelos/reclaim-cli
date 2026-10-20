import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as p from '@clack/prompts'
import { installHook, isHookInstalled, readRcFile } from '@/cli/commands/hook'
import { dailyCommand } from '@/cli/commands/schedule'
import { createContext } from '@/cli/context'
import { configSchema } from '@/config/schema'
import { saveConfig } from '@/config/store'
import { c } from '@/util/format'
import { expandHome, tildify } from '@/util/path'

function cancelled<T>(value: T | symbol): value is symbol {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled. Nothing was changed.')
    return true
  }
  return false
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(expandHome(path))).isDirectory()
  } catch {
    return false
  }
}

export async function initCommand(): Promise<void> {
  const ctx = await createContext()
  p.intro(c.bold('reclaim-cli setup'))

  const defaultRoot = ctx.config.roots.length
    ? ctx.config.roots.join(', ')
    : (await isDirectory(join(homedir(), 'projects')))
      ? '~/projects'
      : ''

  const rootsInput = await p.text({
    message: 'Which folders hold your projects? (comma separated)',
    placeholder: '~/projects',
    initialValue: defaultRoot,
    validate: async (value) => {
      const roots = (value ?? '')
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
      if (roots.length === 0) return 'Enter at least one folder.'
      for (const root of roots)
        if (!(await isDirectory(root))) return `${root} is not an existing folder.`
    },
  })
  if (cancelled(rootsInput)) return

  const days = await p.text({
    message: 'Consider a project stale after how many days without activity?',
    initialValue: String(ctx.config.staleAfterDays),
    validate: (v) =>
      Number.isInteger(Number(v)) && Number(v) > 0 ? undefined : 'Enter a positive whole number.',
  })
  if (cancelled(days)) return

  const minMb = await p.text({
    message: 'Only remind me when at least how many MB can be reclaimed?',
    initialValue: String(ctx.config.minReclaimableMB),
    validate: (v) => (Number(v) >= 0 && v !== '' ? undefined : 'Enter a number.'),
  })
  if (cancelled(minMb)) return

  const at = await p.text({
    message: 'What time should the daily scan run? (HH:mm)',
    initialValue: ctx.config.scheduleAt,
    validate: (v) =>
      /^([01]\d|2[0-3]):[0-5]\d$/.test(v ?? '') ? undefined : 'Use HH:mm, e.g. 10:00',
  })
  if (cancelled(at)) return

  const roots = rootsInput
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => tildify(expandHome(r)))
  const config = configSchema.parse({
    ...ctx.config,
    roots,
    staleAfterDays: Number(days),
    minReclaimableMB: Number(minMb),
    scheduleAt: at,
  })
  await saveConfig(ctx.paths.configDir, config)
  p.log.success(`Saved settings to ${tildify(ctx.paths.configDir)}/config.json`)

  const schedule = await p.confirm({
    message: `Install the daily scan (${config.scheduleAt}) now?`,
  })
  if (cancelled(schedule)) return
  if (schedule) {
    try {
      await ctx.platform.scheduler.install({
        at: config.scheduleAt,
        command: dailyCommand(),
        logDir: ctx.paths.stateDir,
      })
      p.log.success('Daily scan installed.')
    } catch (error) {
      p.log.error(`Could not install the schedule: ${(error as Error).message}`)
    }
  }

  const { hook } = ctx.platform
  if (!isHookInstalled(await readRcFile(hook), hook)) {
    const add = await p.confirm({
      message: `Show a reminder when you open a terminal? (adds one line to ${tildify(hook.rcFile)})`,
    })
    if (cancelled(add)) return
    if (add) {
      await installHook(hook)
      p.log.success(`Added the hook to ${tildify(hook.rcFile)}.`)
    }
  }

  p.outro(
    `All set. Try ${c.cyan('reclaim-cli scan')} now, or ${c.cyan('reclaim-cli review')} to clean up.`,
  )
}
