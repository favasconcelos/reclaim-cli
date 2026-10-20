import { execFileSync } from 'node:child_process'
import { utimesSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach } from 'vitest'
import { type Config, configSchema } from '@/config/schema'
import { DAY_MS } from '@/util/format'

const created: string[] = []

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

export async function tempDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'reclaim-cli-test-')))
  created.push(dir)
  return dir
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS)
}

/** Writes a file (creating parents) and backdates its mtime. */
export async function writeFileAged(path: string, content: string, ageDays: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  const when = daysAgo(ageDays)
  await utimes(path, when, when)
}

export function testConfig(roots: string[], overrides: Partial<Config> = {}): Config {
  return configSchema.parse({ roots, ...overrides })
}

export function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    stdio: 'ignore',
  })
}

/** Creates a git repo whose only commit is `ageDays` old. */
export function gitInitAged(cwd: string, ageDays: number): void {
  const date = daysAgo(ageDays).toISOString()
  git(cwd, 'init', '-q')
  git(cwd, 'add', '-A')
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], {
    cwd,
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
  // Git rewrote HEAD and the index just now; make them look as old as the commit.
  const when = daysAgo(ageDays)
  for (const name of ['HEAD', 'index']) utimesSync(join(cwd, '.git', name), when, when)
}

export async function backdate(path: string, ageDays: number): Promise<void> {
  const when = daysAgo(ageDays)
  await utimes(path, when, when)
}
