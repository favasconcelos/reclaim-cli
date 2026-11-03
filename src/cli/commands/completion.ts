import type { Command } from 'commander'
import { generateBashCompletion } from '@/completion/bash'
import type { Hints } from '@/completion/hints'
import { generatePowerShellCompletion } from '@/completion/powershell'
import { generateZshCompletion, standaloneZshCompletion } from '@/completion/zsh'
import { ReclaimError } from '@/util/errors'

export function completionCommand(shell: string, program: Command, hints: Hints): void {
  if (shell === 'zsh') {
    process.stdout.write(standaloneZshCompletion(program, hints))
    return
  }
  if (shell === 'bash') {
    process.stdout.write(generateBashCompletion(program, hints))
    return
  }
  if (shell === 'powershell') {
    process.stdout.write(generatePowerShellCompletion(program, hints))
    return
  }
  throw new ReclaimError('Supported shells: zsh, bash, powershell.')
}

/** Completion snippet embedded in the shell hook (matches the hook shell). */
export function hookCompletionSnippet(shell: string, program: Command, hints: Hints): string {
  if (shell === 'bash') return generateBashCompletion(program, hints)
  if (shell === 'powershell') return generatePowerShellCompletion(program, hints)
  return generateZshCompletion(program, hints)
}
