import type { Command } from 'commander'
import type { Hints } from '@/completion/hints'

function commandNames(command: Command): string[] {
  return command.commands.map((sub) => sub.name())
}

/**
 * Minimal bash completion generated from the command tree.
 * Completes top-level commands, nested subcommands (one level for
 * `schedule`, `config`, `hook`) and long options.
 */
export function generateBashCompletion(program: Command, _hints: Hints): string {
  const root = commandNames(program).join(' ')
  const nested: string[] = []
  for (const sub of program.commands) {
    if (sub.commands.length > 0) {
      nested.push(`  [${sub.name()}]="${commandNames(sub).join(' ')}"`)
    }
  }
  const options = [
    ...new Set(program.commands.flatMap((c) => c.options.map((o) => o.long).filter(Boolean))),
  ]
  void _hints
  return `_reclaim_cli() {
  local cur prev words cword
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=($(compgen -W "${root}" -- "$cur"))
    return 0
  fi
  local sub="\${COMP_WORDS[1]}"
  case "$sub" in
${program.commands
  .filter((c) => c.commands.length > 0)
  .map(
    (c) => `    ${c.name()}) COMPREPLY=($(compgen -W "${commandNames(c).join(' ')}" -- "$cur")) ;;`,
  )
  .join('\n')}
  esac
  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "${options.join(' ')} --help" -- "$cur"))
  fi
  return 0
}
complete -F _reclaim_cli reclaim-cli
`
}

export function standaloneBashCompletion(program: Command, hints: Hints): string {
  return generateBashCompletion(program, hints)
}
