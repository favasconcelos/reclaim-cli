import { execFileSync, spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Command } from 'commander'
import { describe, expect, it } from 'vitest'
import { defaultHints } from '@/completion/hints'
import { generateZshCompletion, standaloneZshCompletion } from '@/completion/zsh'
import { createZshHook } from '@/platform/macos/hook'
import { buildProgram } from '@/program'
import { tempDir } from './helpers'

const hasZsh = spawnSync('zsh', ['--version']).status === 0
const program = buildProgram()
const completion = generateZshCompletion(program, defaultHints())

function commandPaths(command: Command, prefix: string[] = []): string[][] {
  return command.commands.flatMap((sub) => [
    [...prefix, sub.name()],
    ...commandPaths(sub, [...prefix, sub.name()]),
  ])
}

describe('zsh completion script', () => {
  it('defines a function for the root and for every (nested) command', () => {
    expect(completion).toMatch(/^_reclaim_cli\(\) \{/m)
    for (const path of commandPaths(program)) {
      const name = `_reclaim_cli_${path.join('_').replace(/-/g, '_')}`
      expect(completion, `missing ${name}`).toContain(`${name}() {`)
    }
  })

  it('lists every command with its description', () => {
    for (const sub of program.commands) {
      expect(completion).toContain(`'${sub.name()}:${sub.description()}'`)
    }
  })

  it('emits each option once, with its description and argument', () => {
    expect(completion.match(/--version/g)).toHaveLength(2) // {-V,--version} + exclusion list
    expect(completion).toContain(`'--at=[time of day (default: from config)]:HH\\:mm:'`)
    expect(completion).toContain(`{-y,--yes}'[do not ask for confirmation]'`)
    expect(completion).toContain(`{-n+,--limit=}'[entries to show]:count:'`)
  })

  it('adds the positional hints', () => {
    expect(completion).toContain(`':folder:_files -/'`)
    expect(completion).toContain(`'*:paths:_files -/'`)
    expect(completion).toContain('(staleAfterDays')
    expect(completion).toMatch(/notify\) _values 'value' true false ;;/)
    expect(completion).toMatch(/skipDirty\) _values 'value' true false ;;/)
    expect(completion).not.toMatch(/staleAfterDays\) _values/)
  })

  it('the standalone script registers the completion only when compdef exists', () => {
    const standalone = standaloneZshCompletion(program, defaultHints())
    expect(standalone.startsWith('#compdef reclaim-cli\n')).toBe(true)
    expect(standalone).toContain('(( $+functions[compdef] )) && compdef _reclaim_cli reclaim-cli')
  })
})

describe.runIf(hasZsh)('zsh integration', () => {
  const zsh = (script: string, env: Record<string, string> = {}) =>
    execFileSync('zsh', ['-f', '-c', script], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })

  async function scriptFile(content: string) {
    const dir = await tempDir()
    const file = join(dir, 'hook.zsh')
    await writeFile(file, content)
    return { dir, file }
  }

  it('the generated script is valid zsh', async () => {
    const { file } = await scriptFile(completion)
    expect(() => zsh(`zsh -n ${file}`)).not.toThrow()
  })

  it('hook script registers the completion on the first prompt, and prints nothing while sourcing', async () => {
    const hook = createZshHook({ configDir: '/unused' })
    const { dir, file } = await scriptFile(hook.script({ completion }))

    const out = zsh(
      `autoload -Uz compinit && compinit -u -d ${dir}/zcompdump
       source ${file}
       print -- "before:\${_comps[reclaim-cli]:-none}"
       for f in $precmd_functions; do $f; done
       print -- "after:\${_comps[reclaim-cli]:-none}"`,
      { RECLAIM_CLI_STATE_DIR: dir },
    )

    expect(out).toBe('before:none\nafter:_reclaim_cli\n')
  })

  it('works even when compinit runs after the hook is sourced', async () => {
    const hook = createZshHook({ configDir: '/unused' })
    const { dir, file } = await scriptFile(hook.script({ completion }))

    const out = zsh(
      `source ${file}
       autoload -Uz compinit && compinit -u -d ${dir}/zcompdump
       for f in $precmd_functions; do $f; done
       print -- "\${_comps[reclaim-cli]:-none}"`,
      { RECLAIM_CLI_STATE_DIR: dir },
    )

    expect(out).toBe('_reclaim_cli\n')
  })

  it('hook script without completion does not register one', async () => {
    const hook = createZshHook({ configDir: '/unused' })
    expect(hook.script()).not.toContain('compdef')
  })
})
