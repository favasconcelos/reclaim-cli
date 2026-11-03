import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ScheduleInstallOptions, Scheduler, ScheduleStatus } from '@/platform/types'
import { run } from '@/util/exec'

export const LINUX_SERVICE_NAME = 'reclaim-cli-daily'
export const CRON_MARKER = '# reclaim-cli-daily'

export interface SystemdServiceOptions {
  description?: string
  command: string[]
  logDir: string
}

export interface SystemdTimerOptions {
  description?: string
  at: string
}

/** Quote one argv element for systemd ExecStart (simple, space-safe). */
export function quoteSystemdArg(arg: string): string {
  if (!/[\s"'\\]/.test(arg)) return arg
  return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Quote one argv element for a POSIX shell (cron fallback). */
export function quoteShellArg(arg: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

export function buildService(options: SystemdServiceOptions): string {
  const exec = options.command.map(quoteSystemdArg).join(' ')
  const description = options.description ?? 'reclaim-cli daily scan'
  return `[Unit]
Description=${description}

[Service]
Type=oneshot
ExecStart=${exec}
StandardOutput=append:${join(options.logDir, 'daily.out.log')}
StandardError=append:${join(options.logDir, 'daily.err.log')}

[Install]
WantedBy=default.target
`
}

export function buildTimer(options: SystemdTimerOptions): string {
  const description = options.description ?? 'reclaim-cli daily scan timer'
  return `[Unit]
Description=${description}

[Timer]
OnCalendar=*-*-* ${options.at}:00
Persistent=true

[Install]
WantedBy=timers.target
`
}

export function parseTimerOnCalendar(unit: string): string | undefined {
  const match = /OnCalendar=\S*\s?(\d{2}):(\d{2})(?::\d{2})?/.exec(unit)
  if (!match) return undefined
  return `${match[1]}:${match[2]}`
}

/** Extract the ExecStart argv from a systemd service file (unquoting simply). */
export function parseServiceCommand(unit: string): string[] | undefined {
  const line = /^ExecStart=(.+)$/m.exec(unit)?.[1]?.trim()
  if (!line) return undefined
  const args: string[] = []
  for (const match of line.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g)) {
    const [, quoted, single, bare] = match
    if (quoted !== undefined) args.push(quoted.replace(/\\"/g, '"').replace(/\\\\/g, '\\'))
    else if (single !== undefined) args.push(single)
    else if (bare !== undefined) args.push(bare)
  }
  return args.length > 0 ? args : undefined
}

export function buildCronLine(at: string, command: string[], logDir: string): string {
  const [hour, minute] = at.split(':').map(Number) as [number, number]
  const cmd = command.map(quoteShellArg).join(' ')
  const log = join(logDir, 'daily.log')
  return `${minute} ${hour} * * * ${cmd} >> ${quoteShellArg(log)} 2>&1 ${CRON_MARKER}`
}

async function hasSystemdUser(): Promise<boolean> {
  return (await run('systemctl', ['--user', 'status'])).ok
}

export function createLinuxScheduler(
  options: { unitDir?: string; serviceName?: string } = {},
): Scheduler {
  const serviceName = options.serviceName ?? LINUX_SERVICE_NAME
  const unitDir = options.unitDir ?? join(homedir(), '.config', 'systemd', 'user')
  const servicePath = join(unitDir, `${serviceName}.service`)
  const timerPath = join(unitDir, `${serviceName}.timer`)

  async function installSystemd(at: string, command: string[], logDir: string) {
    await mkdir(logDir, { recursive: true })
    await mkdir(unitDir, { recursive: true })
    await writeFile(servicePath, buildService({ command, logDir }))
    await writeFile(timerPath, buildTimer({ at }))
    const reloaded = await run('systemctl', ['--user', 'daemon-reload'])
    if (!reloaded.ok)
      throw new Error(
        `systemctl daemon-reload failed: ${reloaded.stderr.trim() || `exit ${reloaded.code}`}`,
      )
    const enabled = await run('systemctl', ['--user', 'enable', '--now', `${serviceName}.timer`])
    if (!enabled.ok)
      throw new Error(`systemctl enable failed: ${enabled.stderr.trim() || `exit ${enabled.code}`}`)
  }

  async function installCron(at: string, command: string[], logDir: string) {
    await mkdir(logDir, { recursive: true })
    const current = await run('crontab', ['-l'])
    const lines = current.ok ? current.stdout.split('\n') : []
    const kept = lines.filter((line) => line.trim() !== '' && !line.includes('reclaim-cli-daily'))
    kept.push(buildCronLine(at, command, logDir))
    const dir = await mkdtemp(join(logDir, 'cron-'))
    const file = join(dir, 'crontab')
    try {
      await writeFile(file, `${kept.join('\n')}\n`)
      const result = await run('crontab', [file])
      if (!result.ok)
        throw new Error(`crontab install failed: ${result.stderr.trim() || `exit ${result.code}`}`)
    } finally {
      await rm(file, { force: true }).catch(() => {})
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }

  return {
    async install({ at, command, logDir }: ScheduleInstallOptions) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at))
        throw new Error(`Invalid time "${at}". Use HH:mm (24h).`)
      if (await hasSystemdUser()) {
        try {
          await installSystemd(at, command, logDir)
          return
        } catch {
          // Fall through to cron when systemd user services are unavailable.
        }
      }
      await installCron(at, command, logDir)
    },

    async uninstall() {
      let removed = false
      try {
        await access(servicePath)
        await rm(servicePath, { force: true })
        removed = true
      } catch {
        // No service file.
      }
      try {
        await access(timerPath)
        await rm(timerPath, { force: true })
        removed = true
      } catch {
        // No timer file.
      }
      if (removed) {
        await run('systemctl', ['--user', 'disable', '--now', `${serviceName}.timer`])
        await run('systemctl', ['--user', 'daemon-reload'])
      }
      const current = await run('crontab', ['-l'])
      if (current.ok && current.stdout.includes('reclaim-cli-daily')) {
        const kept = current.stdout
          .split('\n')
          .filter((line) => !line.includes('reclaim-cli-daily') && line.trim() !== '')
        const dir = await mkdtemp(join(homedir(), '.reclaim-cli-cron-'))
        const file = join(dir, 'crontab')
        try {
          await writeFile(file, kept.length > 0 ? `${kept.join('\n')}\n` : '')
          if (kept.length > 0) await run('crontab', [file])
          else await run('crontab', ['-r'])
        } finally {
          await rm(file, { force: true }).catch(() => {})
          await rm(dir, { recursive: true, force: true }).catch(() => {})
        }
        removed = true
      }
      return removed
    },

    async status(): Promise<ScheduleStatus> {
      try {
        const [service, timer] = await Promise.all([
          readFile(servicePath, 'utf8'),
          readFile(timerPath, 'utf8'),
        ])
        const at = parseTimerOnCalendar(timer)
        const command = parseServiceCommand(service)
        const problems: string[] = []
        for (const path of command?.slice(0, 2) ?? []) {
          try {
            await access(path)
          } catch {
            problems.push(`${path} no longer exists; run \`reclaim-cli schedule install\` again`)
          }
        }
        const active = await run('systemctl', ['--user', 'is-active', `${serviceName}.timer`])
        const loaded = active.ok
        if (!loaded) problems.push('the timer is not active; run `reclaim-cli schedule install`')
        return { installed: true, loaded, at, command, problems }
      } catch {
        // No systemd files; check cron.
      }
      const current = await run('crontab', ['-l'])
      if (current.ok && current.stdout.includes('reclaim-cli-daily')) {
        const line = current.stdout.split('\n').find((l) => l.includes('reclaim-cli-daily'))
        const at = line ? parseCronTime(line) : undefined
        return { installed: true, loaded: true, at, command: undefined, problems: [] }
      }
      return { installed: false, loaded: false, problems: [] }
    },
  }
}

export function parseCronTime(line: string): string | undefined {
  const match = /^(\d+)\s+(\d+)\s+\*\s+\*\s+\*/.exec(line.trim())
  if (!match) return undefined
  return `${match[2]?.padStart(2, '0')}:${match[1]?.padStart(2, '0')}`
}
