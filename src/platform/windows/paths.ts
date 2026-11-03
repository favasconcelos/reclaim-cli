import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Windows-known-folder locations. Respects the RECLAIM_CLI_* overrides so
 * tests and portable installs keep working.
 */
export function windowsPaths(env: NodeJS.ProcessEnv = process.env) {
  const home = homedir()
  const roaming = env.APPDATA ?? join(home, 'AppData', 'Roaming')
  const local = env.LOCALAPPDATA ?? env.APPDATA ?? join(home, 'AppData', 'Local')
  return {
    configDir: env.RECLAIM_CLI_CONFIG_DIR ?? join(roaming, 'reclaim-cli'),
    stateDir: env.RECLAIM_CLI_STATE_DIR ?? join(local, 'reclaim-cli'),
  }
}
