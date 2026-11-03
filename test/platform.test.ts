import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateBashCompletion } from '@/completion/bash'
import { defaultHints } from '@/completion/hints'
import { generatePowerShellCompletion } from '@/completion/powershell'
import { sizeOfTree } from '@/core/size'
import { createBashHook } from '@/platform/linux/hook'
import { linuxPaths } from '@/platform/linux/paths'
import {
  buildCronLine,
  buildService,
  buildTimer,
  parseCronTime,
  parseServiceCommand,
  parseTimerOnCalendar,
} from '@/platform/linux/scheduler'
import { createPowerShellHook } from '@/platform/windows/hook'
import { windowsPaths } from '@/platform/windows/paths'
import {
  buildTaskRunCommand,
  parseTaskListOutput,
  splitWindowsCommand,
} from '@/platform/windows/scheduler'
import { buildProgram } from '@/program'
import { tempDir } from './helpers'

describe('platform paths', () => {
  it('respects RECLAIM_CLI_* overrides on linux', () => {
    const paths = linuxPaths({
      RECLAIM_CLI_CONFIG_DIR: '/tmp/cfg',
      RECLAIM_CLI_STATE_DIR: '/tmp/state',
    } as NodeJS.ProcessEnv)
    expect(paths).toEqual({ configDir: '/tmp/cfg', stateDir: '/tmp/state' })
  })

  it('uses APPDATA/LOCALAPPDATA on windows with overrides', () => {
    const paths = windowsPaths({
      APPDATA: 'C:\\Roaming',
      LOCALAPPDATA: 'C:\\Local',
    } as unknown as NodeJS.ProcessEnv)
    expect(paths.configDir).toContain('reclaim-cli')
    expect(paths.stateDir).toContain('reclaim-cli')
    const overridden = windowsPaths({
      RECLAIM_CLI_CONFIG_DIR: 'C:\\cfg',
      RECLAIM_CLI_STATE_DIR: 'C:\\state',
    } as unknown as NodeJS.ProcessEnv)
    expect(overridden).toEqual({ configDir: 'C:\\cfg', stateDir: 'C:\\state' })
  })
})

describe('linux scheduler builders', () => {
  it('round-trips service command and timer time', () => {
    const command = ['/usr/bin/node', '/opt/a b/reclaim-cli.js', 'scan', '--notify', '--quiet']
    const service = buildService({ command, logDir: '/tmp/logs' })
    expect(parseServiceCommand(service)).toEqual(command)
    const timer = buildTimer({ at: '09:05' })
    expect(parseTimerOnCalendar(timer)).toBe('09:05')
  })

  it('builds a cron line with marker and parses the time back', () => {
    const line = buildCronLine('10:30', ['/usr/bin/node', '/opt/app/cli.js'], '/tmp/logs')
    expect(line).toMatch(/^30 10 /)
    expect(line).toContain('reclaim-cli-daily')
    expect(parseCronTime(line)).toBe('10:30')
  })
})

describe('windows scheduler builders', () => {
  it('quotes paths with spaces and round-trips', () => {
    const command = ['C:\\Program Files\\nodejs\\node.exe', 'C:\\app\\cli.js', 'scan']
    const tr = buildTaskRunCommand(command)
    expect(tr).toContain('"C:\\Program Files\\nodejs\\node.exe"')
    expect(splitWindowsCommand(tr)).toEqual(command)
  })

  it('parses schtasks LIST output', () => {
    const { at, command } = parseTaskListOutput(
      'Task To Run: C:\\node.exe C:\\cli.js scan\nStart Time: 9:05:00\n',
    )
    expect(at).toBe('09:05')
    expect(command).toEqual(['C:\\node.exe', 'C:\\cli.js', 'scan'])
  })
})

describe('portable size walk', () => {
  it('sums file bytes', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'a.txt'), '12345')
    await writeFile(join(dir, 'sub', 'b.txt'), '123')
    expect(await sizeOfTree(dir)).toBe(8)
    expect(await sizeOfTree(join(dir, 'missing'))).toBe(0)
  })
})

describe('shell hooks', () => {
  it('bash hook never starts Node and uses PROMPT_COMMAND', async () => {
    const dir = await tempDir()
    const hook = createBashHook({ configDir: join(dir, 'cfg') })
    expect(hook.shell).toBe('bash')
    expect(hook.rcFile.endsWith('.bashrc')).toBe(true)
    expect(hook.script()).not.toMatch(/\bnode\b/)
    expect(hook.script()).toContain('PROMPT_COMMAND')
  })

  it('powershell hook never starts Node and checks the pending file', async () => {
    const dir = await tempDir()
    const hook = createPowerShellHook({ configDir: join(dir, 'cfg') })
    expect(hook.shell).toBe('powershell')
    expect(hook.script()).not.toMatch(/\bnode\b/)
    expect(hook.script()).toContain('pending')
  })
})

describe('shell completions', () => {
  it('bash and powershell completions mention reclaim-cli commands', () => {
    const program = buildProgram()
    const hints = defaultHints()
    expect(generateBashCompletion(program, hints)).toContain('reclaim-cli')
    expect(generatePowerShellCompletion(program, hints)).toContain('reclaim-cli')
  })
})
