import { homedir } from 'node:os'
import { join } from 'node:path'

export function macosPaths(env: NodeJS.ProcessEnv = process.env) {
  const home = homedir()
  return {
    configDir: env.STALE_CONFIG_DIR ?? join(home, '.config', 'stale'),
    stateDir: env.STALE_STATE_DIR ?? join(home, '.local', 'state', 'stale'),
  }
}
