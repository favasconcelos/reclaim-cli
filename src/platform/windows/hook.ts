import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ShellHook } from '@/platform/types'

/** Reminders older than this are stale data and are not shown. */
const MAX_AGE_DAYS = 3

export function windowsProfilePath(home = homedir()): string {
  return join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1')
}

export function createPowerShellHook(options: { configDir: string }): ShellHook {
  const scriptFile = join(options.configDir, 'hook.ps1')
  const rcFile = windowsProfilePath()

  return {
    shell: 'powershell',
    rcFile,
    scriptFile,
    // Dot-source the hook when the profile loads. Single quotes are safe here
    // because Windows paths cannot contain the escaping edge cases of sh.
    rcLine: `. '${scriptFile}'`,
    legacyRcLines: [],
    // Pure PowerShell: no Node at prompt time. Prints the pending line once
    // when the profile loads (profile scripts run once per shell).
    script: ({
      completion,
    } = {}) => `# reclaim-cli: pending cleanup reminder (pure PowerShell, never starts Node)
${completion ? `${completion}\n` : ''}$reclaimStateDir = if ($env:RECLAIM_CLI_STATE_DIR) { $env:RECLAIM_CLI_STATE_DIR } elseif ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'reclaim-cli' } else { Join-Path $HOME 'AppData\\Local\\reclaim-cli' }
$reclaimPending = Join-Path $reclaimStateDir 'pending'
if (Test-Path $reclaimPending) {
  $age = (Get-Date) - (Get-Item $reclaimPending).LastWriteTime
  if ($age.TotalDays -lt ${MAX_AGE_DAYS}) {
    Get-Content $reclaimPending
  }
}
`,
  }
}
