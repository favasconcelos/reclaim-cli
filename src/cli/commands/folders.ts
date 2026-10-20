import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createContext } from '@/cli/context'
import { saveConfig } from '@/config/store'
import { StaleError } from '@/util/errors'
import { c } from '@/util/format'
import { expandHome, tildify } from '@/util/path'

async function normalize(folder: string, mustBeDirectory: boolean): Promise<string> {
  const absolute = resolve(expandHome(folder))
  if (mustBeDirectory) {
    try {
      if (!(await stat(absolute)).isDirectory()) throw new Error('not a directory')
    } catch {
      throw new StaleError(`${absolute} is not an existing folder.`)
    }
  }
  return tildify(absolute)
}

export async function addCommand(folder: string): Promise<void> {
  const ctx = await createContext()
  const entry = await normalize(folder, true)
  if (ctx.config.roots.includes(entry)) {
    console.log(`${entry} is already watched.`)
    return
  }
  await saveConfig(ctx.paths.configDir, { ...ctx.config, roots: [...ctx.config.roots, entry] })
  console.log(`${c.green('✔')} Watching ${entry}`)
}

export async function removeCommand(folder: string): Promise<void> {
  const ctx = await createContext()
  const entry = await normalize(folder, false)
  if (!ctx.config.roots.includes(entry)) throw new StaleError(`${entry} is not a watched folder.`)
  await saveConfig(ctx.paths.configDir, {
    ...ctx.config,
    roots: ctx.config.roots.filter((r) => r !== entry),
  })
  console.log(`${c.green('✔')} No longer watching ${entry}`)
}

export async function ignoreCommand(path: string, flags: { remove?: boolean }): Promise<void> {
  const ctx = await createContext()
  const entry = await normalize(path, false)
  const has = ctx.config.ignore.includes(entry)
  if (flags.remove) {
    if (!has) throw new StaleError(`${entry} is not in the ignore list.`)
    await saveConfig(ctx.paths.configDir, {
      ...ctx.config,
      ignore: ctx.config.ignore.filter((i) => i !== entry),
    })
    console.log(`${c.green('✔')} Un-ignored ${entry}`)
    return
  }
  if (has) {
    console.log(`${entry} is already ignored.`)
    return
  }
  await saveConfig(ctx.paths.configDir, { ...ctx.config, ignore: [...ctx.config.ignore, entry] })
  console.log(`${c.green('✔')} Ignoring ${entry} (and everything inside it)`)
}
