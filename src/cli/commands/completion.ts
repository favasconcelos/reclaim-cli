import type { Command } from 'commander'
import type { Hints } from '@/completion/hints'
import { standaloneZshCompletion } from '@/completion/zsh'
import { ReclaimError } from '@/util/errors'

export function completionCommand(shell: string, program: Command, hints: Hints): void {
  if (shell !== 'zsh') throw new ReclaimError('Only zsh is supported for now.')
  process.stdout.write(standaloneZshCompletion(program, hints))
}
