import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type Config, configSchema, SCALAR_KEYS } from '@/config/schema'
import { StaleError } from '@/util/errors'

const fileOf = (configDir: string) => join(configDir, 'config.json')

export async function loadConfig(configDir: string): Promise<Config> {
  let raw: unknown = {}
  try {
    raw = JSON.parse(await readFile(fileOf(configDir), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new StaleError(`Could not read ${fileOf(configDir)}: ${(error as Error).message}`)
    }
  }
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new StaleError(`Invalid config at ${fileOf(configDir)} (${issues})`)
  }
  return parsed.data
}

export async function saveConfig(configDir: string, config: Config): Promise<void> {
  await mkdir(configDir, { recursive: true })
  await writeFile(fileOf(configDir), `${JSON.stringify(config, null, 2)}\n`)
}

export function configFilePath(configDir: string): string {
  return fileOf(configDir)
}

/** Applies a `stale config set <key> <value>` string to a scalar setting. */
export function applyScalar(config: Config, key: string, raw: string): Config {
  if (!(SCALAR_KEYS as readonly string[]).includes(key)) {
    throw new StaleError(
      `Unknown or non-scalar setting "${key}". Settable: ${SCALAR_KEYS.join(', ')}. ` +
        'Lists are managed with `stale add/remove/ignore`.',
    )
  }
  const current = config[key as (typeof SCALAR_KEYS)[number]]
  let value: string | number | boolean = raw
  if (typeof current === 'number') value = Number(raw)
  if (typeof current === 'boolean') {
    if (raw !== 'true' && raw !== 'false') throw new StaleError(`"${key}" expects true or false.`)
    value = raw === 'true'
  }
  const parsed = configSchema.safeParse({ ...config, [key]: value })
  if (!parsed.success) {
    throw new StaleError(
      `Invalid value for "${key}": ${parsed.error.issues[0]?.message ?? 'invalid'}`,
    )
  }
  return parsed.data
}
