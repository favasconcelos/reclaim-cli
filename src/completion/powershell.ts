import type { Command } from 'commander'
import type { Hints } from '@/completion/hints'

/**
 * Minimal PowerShell tab completion via Register-ArgumentCompleter.
 * Completes command names and long options; keeps the profile pure
 * PowerShell with no Node at prompt time.
 */
export function generatePowerShellCompletion(program: Command, _hints: Hints): string {
  void _hints
  const root = program.commands.map((c) => c.name())
  const cases = program.commands
    .filter((c) => c.commands.length > 0)
    .map((c) => {
      const subs = c.commands.map((s) => `'${s.name()}'`).join(', ')
      return `      '${c.name()}' { @(${subs}) }`
    })
    .join('\n')
  const options = [
    ...new Set(program.commands.flatMap((c) => c.options.map((o) => o.long).filter(Boolean))),
  ]
    .map((o) => `'${o}'`)
    .join(', ')
  return `Register-ArgumentCompleter -CommandName @('reclaim-cli') -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $words = $commandAst.ToString() -split '\\s+'
  $rootCommands = @(${root.map((r) => `'${r}'`).join(', ')})
  if ($words.Count -le 2) {
    $rootCommands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new($_, $_, 'CommandName', $_)
    }
    return
  }
  $sub = $words[1]
  $nested = switch ($sub) {
${cases}
    default { @() }
  }
  if ($nested.Count -gt 0 -and $words.Count -le 3) {
    $nested | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new($_, $_, 'CommandName', $_)
    }
    return
  }
  if ($wordToComplete -like '-*') {
    @(${options || "'--help'"}) | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)
    }
  }
}
`
}

export function standalonePowerShellCompletion(program: Command, hints: Hints): string {
  return generatePowerShellCompletion(program, hints)
}
