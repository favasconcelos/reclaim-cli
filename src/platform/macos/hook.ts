import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ShellHook } from '@/platform/types'
import { tildify } from '@/util/path'

/** Reminders older than this are stale data and are not shown. */
const MAX_AGE_SECONDS = 3 * 24 * 60 * 60

/** Lines written while the tool was still called `stale`; they are replaced on `hook install`. */
const LEGACY_RC_LINES = [
  'eval "$(stale hook zsh)"',
  '[[ -r "$HOME/.config/stale/hook.zsh" ]] && source "$HOME/.config/stale/hook.zsh"',
]

export function createZshHook(options: { configDir: string }): ShellHook {
  const scriptFile = join(options.configDir, 'hook.zsh')
  const shellPath = tildify(scriptFile).replace(/^~/, '$HOME')

  return {
    shell: 'zsh',
    rcFile: join(homedir(), '.zshrc'),
    scriptFile,
    rcLine: `[[ -r "${shellPath}" ]] && source "${shellPath}"`,
    legacyRcLines: LEGACY_RC_LINES,
    // Printing from a one-shot precmd hook (not while .zshrc loads) keeps Powerlevel10k's
    // instant prompt happy, and nothing here starts Node.
    script: ({
      completion,
    } = {}) => `# reclaim-cli: pending cleanup reminder (pure zsh, never starts Node)
${completion ? `${completion}\n` : ''}_reclaim_cli_reminder() {
  add-zsh-hook -d precmd _reclaim_cli_reminder
${completion ? '  # By the first prompt compinit has run, so compdef exists whatever the rc file order.\n  (( $+functions[compdef] )) && compdef _reclaim_cli reclaim-cli\n' : ''}  local file="\${RECLAIM_CLI_STATE_DIR:-$HOME/.local/state/reclaim-cli}/pending"
  [[ -s $file ]] || return 0
  zmodload -F zsh/stat b:zstat 2>/dev/null || return 0
  zmodload zsh/datetime 2>/dev/null || return 0
  local -a mtime
  zstat -A mtime +mtime -- "$file" 2>/dev/null || return 0
  (( EPOCHSECONDS - mtime[1] < ${MAX_AGE_SECONDS} )) || return 0
  print -r -- "$(<"$file")"
}
autoload -Uz add-zsh-hook
add-zsh-hook precmd _reclaim_cli_reminder
`,
  }
}
