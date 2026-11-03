import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ShellHook } from '@/platform/types'
import { tildify } from '@/util/path'

/** Reminders older than this are stale data and are not shown. */
const MAX_AGE_SECONDS = 3 * 24 * 60 * 60

const LEGACY_RC_LINES: string[] = []

export function createBashHook(options: { configDir: string }): ShellHook {
  const scriptFile = join(options.configDir, 'hook.bash')
  const shellPath = tildify(scriptFile).replace(/^~/, '$HOME')

  return {
    shell: 'bash',
    rcFile: join(homedir(), '.bashrc'),
    scriptFile,
    rcLine: `[[ -r "${shellPath}" ]] && source "${shellPath}"`,
    legacyRcLines: LEGACY_RC_LINES,
    // Pure bash: no Node at prompt time. Runs once via PROMPT_COMMAND, then removes itself.
    script: ({
      completion,
    } = {}) => `# reclaim-cli: pending cleanup reminder (pure bash, never starts Node)
${completion ? `${completion}\n` : ''}_reclaim_cli_reminder() {
  # Remove this hook so the reminder prints only once per shell.
  if [[ "\${PROMPT_COMMAND-}" == *"_reclaim_cli_reminder"* ]]; then
    PROMPT_COMMAND="\${PROMPT_COMMAND//_reclaim_cli_reminder;/}"
    PROMPT_COMMAND="\${PROMPT_COMMAND//_reclaim_cli_reminder/}"
  fi
  local file="\${RECLAIM_CLI_STATE_DIR:-$HOME/.local/state/reclaim-cli}/pending"
  [[ -s "$file" ]] || return 0
  local mtime now
  mtime=$(stat -c %Y -- "$file" 2>/dev/null) || return 0
  now=$(date +%s 2>/dev/null) || return 0
  (( now - mtime < ${MAX_AGE_SECONDS} )) || return 0
  cat -- "$file"
}
if [[ "\${PROMPT_COMMAND-}" != *"_reclaim_cli_reminder"* ]]; then
  PROMPT_COMMAND="_reclaim_cli_reminder;\${PROMPT_COMMAND-}"
fi
`,
  }
}
