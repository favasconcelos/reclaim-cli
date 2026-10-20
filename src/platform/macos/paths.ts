import { homedir } from 'node:os'
import { join } from 'node:path'

export function macosPaths(env: NodeJS.ProcessEnv = process.env) {
  const home = homedir()
  return {
    configDir: env.RECLAIM_CLI_CONFIG_DIR ?? join(home, '.config', 'reclaim-cli'),
    stateDir: env.RECLAIM_CLI_STATE_DIR ?? join(home, '.local', 'state', 'reclaim-cli'),
  }
}
