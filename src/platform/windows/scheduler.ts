import type { ScheduleInstallOptions, Scheduler, ScheduleStatus } from '@/platform/types'
import { run } from '@/util/exec'

export const WINDOWS_TASK_NAME = 'reclaim-cli-daily'

/** Quote one argv element for schtasks /TR (double-quote paths with spaces). */
export function quoteWindowsArg(arg: string): string {
  if (!/[\s"]/.test(arg)) return arg
  return `"${arg.replace(/"/g, '\\"')}"`
}

export function buildTaskRunCommand(command: string[]): string {
  return command.map(quoteWindowsArg).join(' ')
}

export function parseTaskListOutput(output: string): { at?: string; command?: string[] } {
  let at: string | undefined
  let command: string[] | undefined
  for (const line of output.split('\n')) {
    const time = /^Start Time:\s*(\d{1,2}):(\d{2})/i.exec(line.trim())
    if (time) at = `${time[1]?.padStart(2, '0')}:${time[2]}`
    const task = /^Task To Run:\s*(.+)$/i.exec(line.trim())
    if (task?.[1]) command = splitWindowsCommand(task[1].trim())
  }
  return { at, command }
}

/** Split a /TR string on spaces, respecting double quotes (simple). */
export function splitWindowsCommand(tr: string): string[] {
  const args: string[] = []
  for (const match of tr.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)) {
    const [, quoted, bare] = match
    if (quoted !== undefined) args.push(quoted.replace(/\\"/g, '"'))
    else if (bare !== undefined) args.push(bare)
  }
  return args
}

export function createWindowsScheduler(options: { taskName?: string } = {}): Scheduler {
  const taskName = options.taskName ?? WINDOWS_TASK_NAME

  return {
    async install({ at, command, logDir }: ScheduleInstallOptions) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at))
        throw new Error(`Invalid time "${at}". Use HH:mm (24h).`)
      const { mkdir } = await import('node:fs/promises')
      await mkdir(logDir, { recursive: true })
      const tr = buildTaskRunCommand(command)
      const result = await run('schtasks', [
        '/Create',
        '/TN',
        taskName,
        '/TR',
        tr,
        '/SC',
        'DAILY',
        '/ST',
        at,
        '/F',
      ])
      if (!result.ok) {
        throw new Error(
          `schtasks create failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`}`,
        )
      }
    },

    async uninstall() {
      const result = await run('schtasks', ['/Delete', '/TN', taskName, '/F'])
      return result.ok
    },

    async status(): Promise<ScheduleStatus> {
      const queried = await run('schtasks', ['/Query', '/TN', taskName, '/FO', 'LIST', '/V'])
      if (!queried.ok) return { installed: false, loaded: false, problems: [] }
      const { at, command } = parseTaskListOutput(queried.stdout)
      const problems: string[] = []
      if (command) {
        const { access } = await import('node:fs/promises')
        for (const path of command.slice(0, 2)) {
          // schtasks may return quoted paths; only check absolute paths.
          if (!/^[a-zA-Z]:[\\/]|^\\\\/.test(path)) continue
          try {
            await access(path)
          } catch {
            problems.push(`${path} no longer exists; run \`reclaim-cli schedule install\` again`)
          }
        }
      }
      return { installed: true, loaded: true, at, command, problems }
    },
  }
}
