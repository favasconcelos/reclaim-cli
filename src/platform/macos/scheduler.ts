import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ScheduleInstallOptions, Scheduler, ScheduleStatus } from '@/platform/types'
import { run } from '@/util/exec'

export const LAUNCHD_LABEL = 'dev.stale.daily'

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface PlistOptions {
  label: string
  programArguments: string[]
  hour: number
  minute: number
  stdoutPath: string
  stderrPath: string
}

/** launchd starts jobs with an almost empty environment, so PATH is set explicitly. */
export function buildPlist(options: PlistOptions): string {
  const args = options.programArguments
    .map((a) => `    <string>${escapeXml(a)}</string>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(options.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${options.hour}</integer>
    <key>Minute</key>
    <integer>${options.minute}</integer>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
  <key>LowPriorityIO</key>
  <true/>
  <key>Nice</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(options.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(options.stderrPath)}</string>
</dict>
</plist>
`
}

export function parsePlist(xml: string): { at?: string; command?: string[] } {
  const hour = /<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/.exec(xml)?.[1]
  const minute = /<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/.exec(xml)?.[1]
  const block = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(xml)?.[1]
  const command = block
    ? [...block.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) =>
        (m[1] as string).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
      )
    : undefined
  const at =
    hour !== undefined && minute !== undefined
      ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
      : undefined
  return { at, command }
}

export function createLaunchdScheduler(
  options: { plistDir?: string; label?: string } = {},
): Scheduler {
  const label = options.label ?? LAUNCHD_LABEL
  const plistPath = join(
    options.plistDir ?? join(homedir(), 'Library', 'LaunchAgents'),
    `${label}.plist`,
  )
  const domain = `gui/${process.getuid?.() ?? 501}`

  return {
    async install({ at, command, logDir }: ScheduleInstallOptions) {
      const [hour, minute] = at.split(':').map(Number) as [number, number]
      await mkdir(logDir, { recursive: true })
      await mkdir(join(plistPath, '..'), { recursive: true })
      await writeFile(
        plistPath,
        buildPlist({
          label,
          programArguments: command,
          hour,
          minute,
          stdoutPath: join(logDir, 'daily.out.log'),
          stderrPath: join(logDir, 'daily.err.log'),
        }),
      )
      await run('launchctl', ['bootout', `${domain}/${label}`])
      const result = await run('launchctl', ['bootstrap', domain, plistPath])
      if (!result.ok) {
        throw new Error(
          `launchctl bootstrap failed: ${result.stderr.trim() || `exit ${result.code}`}`,
        )
      }
    },

    async uninstall() {
      const unloaded = await run('launchctl', ['bootout', `${domain}/${label}`])
      let removed = false
      try {
        await access(plistPath)
        await rm(plistPath)
        removed = true
      } catch {
        // No plist on disk.
      }
      return removed || unloaded.ok
    },

    async status(): Promise<ScheduleStatus> {
      let xml: string
      try {
        xml = await readFile(plistPath, 'utf8')
      } catch {
        return { installed: false, loaded: false, problems: [] }
      }
      const { at, command } = parsePlist(xml)
      const problems: string[] = []
      for (const path of command?.slice(0, 2) ?? []) {
        try {
          await access(path)
        } catch {
          problems.push(`${path} no longer exists; run \`stale schedule install\` again`)
        }
      }
      const loaded = (await run('launchctl', ['print', `${domain}/${label}`])).ok
      if (!loaded) problems.push('the job is not loaded in launchd; run `stale schedule install`')
      return { installed: true, loaded, at, command, problems }
    },
  }
}
