import { execFileSync, spawnSync } from 'node:child_process'
import { readFile, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installHook } from '@/cli/commands/hook'
import { createZshHook } from '@/platform/macos/hook'
import { tempDir } from './helpers'

const hasZsh = spawnSync('zsh', ['--version']).status === 0

async function setup() {
  const dir = await tempDir()
  const hook = { ...createZshHook({ configDir: join(dir, 'cfg') }), rcFile: join(dir, '.zshrc') }
  return { dir, hook }
}

describe('zsh hook script', () => {
  it('never starts Node or calls reclaim-cli', async () => {
    const { hook } = await setup()
    expect(hook.script()).not.toMatch(/\bnode\b|\breclaim-cli\s+\w/)
  })

  it('rc line only sources a file, so it is silent when reclaim-cli is not installed', async () => {
    const { hook } = await setup()
    expect(hook.rcLine).toMatch(/^\[\[ -r .+ \]\] && source /)
    expect(hook.rcLine).not.toContain('eval')
  })
})

describe.runIf(hasZsh)('zsh hook behaviour', () => {
  async function runPrecmd(stateDir: string) {
    const { hook } = await setup()
    await writeFile(hook.scriptFile.replace('hook.zsh', 'x'), '').catch(() => {})
    const script = join(stateDir, 'hook.zsh')
    await writeFile(script, hook.script())
    // Sourcing must print nothing (p10k instant prompt); the reminder appears on the first prompt.
    const sourced = execFileSync(
      'zsh',
      [
        '-f',
        '-c',
        `source ${script}; print -- "--"; for f in $precmd_functions; do $f; done; for f in $precmd_functions; do $f; done`,
      ],
      { env: { ...process.env, RECLAIM_CLI_STATE_DIR: stateDir }, encoding: 'utf8' },
    )
    return sourced
  }

  it('prints the pending line once, on the first prompt only', async () => {
    const state = await tempDir()
    await writeFile(join(state, 'pending'), 'REMINDER LINE\n')
    const out = await runPrecmd(state)
    expect(out).toBe('--\nREMINDER LINE\n')
  })

  it('prints nothing when the pending file is missing or older than 3 days', async () => {
    const state = await tempDir()
    expect(await runPrecmd(state)).toBe('--\n')

    await writeFile(join(state, 'pending'), 'OLD\n')
    const old = new Date(Date.now() - 4 * 86_400_000)
    await utimes(join(state, 'pending'), old, old)
    expect(await runPrecmd(state)).toBe('--\n')
  })
})

describe('installHook', () => {
  it('writes the script and appends the rc line once', async () => {
    const { hook } = await setup()
    await writeFile(hook.rcFile, 'export A=1')

    expect(await installHook(hook)).toBe('added')
    expect(await installHook(hook)).toBe('unchanged')

    const rc = await readFile(hook.rcFile, 'utf8')
    expect(rc.match(/source/g)).toHaveLength(1)
    expect(rc.startsWith('export A=1\n')).toBe(true)
    expect(await readFile(hook.scriptFile, 'utf8')).toBe(hook.script())
  })

  it.each([
    ['the eval line', 'eval "$(stale hook zsh)"'],
    [
      'the old source line',
      '[[ -r "$HOME/.config/stale/hook.zsh" ]] && source "$HOME/.config/stale/hook.zsh"',
    ],
  ])('migrates %s from the pre-rename `stale` hook in place', async (_name, legacyLine) => {
    const { hook } = await setup()
    await writeFile(hook.rcFile, `a\n# stale: cleanup reminder\n${legacyLine}\nb\n`)

    expect(await installHook(hook)).toBe('migrated')
    expect(await readFile(hook.rcFile, 'utf8')).toBe(
      `a\n# reclaim-cli: cleanup reminder\n${hook.rcLine}\nb\n`,
    )
  })
})
