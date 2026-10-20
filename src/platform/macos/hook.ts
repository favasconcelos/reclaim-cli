import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ShellHook } from '@/platform/types'
import { tildify } from '@/util/path'

/** Reminders older than this are stale data and are not shown. */
const MAX_AGE_SECONDS = 3 * 24 * 60 * 60

/** Earlier versions added this line, which started Node on every new shell. */
const LEGACY_RC_LINES = ['eval "$(stale hook zsh)"']

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
    script: () => `# stale: pending cleanup reminder (pure zsh, never starts Node)
_stale_reminder() {
  add-zsh-hook -d precmd _stale_reminder
  local file="\${STALE_STATE_DIR:-$HOME/.local/state/stale}/pending"
  [[ -s $file ]] || return 0
  zmodload -F zsh/stat b:zstat 2>/dev/null || return 0
  zmodload zsh/datetime 2>/dev/null || return 0
  local -a mtime
  zstat -A mtime +mtime -- "$file" 2>/dev/null || return 0
  (( EPOCHSECONDS - mtime[1] < ${MAX_AGE_SECONDS} )) || return 0
  print -r -- "$(<"$file")"
}
autoload -Uz add-zsh-hook
add-zsh-hook precmd _stale_reminder
`,
  }
}
