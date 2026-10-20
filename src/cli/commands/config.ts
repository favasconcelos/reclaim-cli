import { createContext } from '@/cli/context'
import { applyScalar, configFilePath, saveConfig } from '@/config/store'
import { StaleError } from '@/util/errors'

export async function configGetCommand(key?: string): Promise<void> {
  const ctx = await createContext()
  if (!key) {
    console.log(JSON.stringify(ctx.config, null, 2))
    console.log(`\n# ${configFilePath(ctx.paths.configDir)}`)
    return
  }
  if (!(key in ctx.config)) throw new StaleError(`Unknown setting "${key}".`)
  console.log(JSON.stringify(ctx.config[key as keyof typeof ctx.config]))
}

export async function configSetCommand(key: string, value: string): Promise<void> {
  const ctx = await createContext()
  const updated = applyScalar(ctx.config, key, value)
  await saveConfig(ctx.paths.configDir, updated)
  console.log(`${key} = ${JSON.stringify(updated[key as keyof typeof updated])}`)
  if (key === 'scheduleAt') console.log('Run `stale schedule install` to apply the new time.')
}
