import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createContext } from '@/cli/context'
import type { ShellHook } from '@/platform/types'
import { c } from '@/util/format'
import { tildify } from '@/util/path'

const RC_COMMENT = '# stale: cleanup reminder'

export type HookInstallStatus = 'added' | 'migrated' | 'unchanged'

export async function readRcFile(hook: ShellHook): Promise<string> {
  return readFile(hook.rcFile, 'utf8').catch(() => '')
}

export function isHookInstalled(rc: string, hook: ShellHook): boolean {
  return rc.includes(hook.rcLine)
}

/** Writes the hook script and makes sure the rc file sources it (replacing the legacy line). */
export async function installHook(hook: ShellHook): Promise<HookInstallStatus> {
  await mkdir(dirname(hook.scriptFile), { recursive: true })
  await writeFile(hook.scriptFile, hook.script())

  const rc = await readRcFile(hook)
  if (isHookInstalled(rc, hook)) return 'unchanged'

  const legacy = hook.legacyRcLines.find((line) => rc.includes(line))
  if (legacy) {
    await writeFile(hook.rcFile, rc.replace(legacy, hook.rcLine))
    return 'migrated'
  }

  const separator = rc === '' || rc.endsWith('\n') ? '' : '\n'
  await writeFile(hook.rcFile, `${rc}${separator}\n${RC_COMMENT}\n${hook.rcLine}\n`)
  return 'added'
}

export async function hookInstallCommand(): Promise<void> {
  const { platform } = await createContext()
  const status = await installHook(platform.hook)
  const rc = tildify(platform.hook.rcFile)
  const messages: Record<HookInstallStatus, string> = {
    added: `Added the reminder to ${rc}.`,
    migrated: `Replaced the old hook line in ${rc}.`,
    unchanged: `${rc} already sources the reminder.`,
  }
  console.log(`${c.green('✔')} ${messages[status]} Open a new terminal to see it.`)
}

export async function hookPrintCommand(): Promise<void> {
  const { platform } = await createContext()
  process.stdout.write(platform.hook.script())
}
