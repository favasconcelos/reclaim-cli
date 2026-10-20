import { homedir } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'

export function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

export function tildify(p: string): string {
  const home = homedir()
  if (p === home) return '~'
  if (p.startsWith(home + sep)) return `~${p.slice(home.length)}`
  return p
}

/** True when `child` is strictly inside `parent`. */
export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}
