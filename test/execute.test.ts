import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPlan, executePlan, removalBlocker } from '@/core/execute'
import { scan } from '@/core/scan'
import type { ProjectReport } from '@/core/types'
import { createProjectTypes } from '@/types'
import { createSwiftType } from '@/types/swift'
import { tempDir, testConfig, writeFileAged } from './helpers'

function project(path: string, artifactPaths: string[], scope = path): ProjectReport {
  return {
    path,
    name: 'p',
    types: ['node'],
    lastActivityMs: 0,
    idleDays: 999,
    stale: true,
    git: { isRepo: false, dirty: false, unpushed: false, lastCommitMs: null },
    artifacts: artifactPaths.map((p) => ({ path: p, label: 'x', sizeBytes: 10, scope })),
    protectedReason: null,
    reclaimableBytes: 10 * artifactPaths.length,
  }
}

describe('removalBlocker', () => {
  it('allows paths strictly inside their scope', () => {
    expect(removalBlocker('/a/b/node_modules', '/a/b')).toBeNull()
  })

  it('refuses the scope itself, escapes, home and root', () => {
    expect(removalBlocker('/a/b', '/a/b')).not.toBeNull()
    expect(removalBlocker('/a/other', '/a/b')).not.toBeNull()
    expect(removalBlocker('/a/b/../other', '/a/b')).not.toBeNull()
    expect(removalBlocker(homedir(), '/')).not.toBeNull()
    expect(removalBlocker('/', '/')).not.toBeNull()
  })
})

describe('executePlan', () => {
  it('removes artifacts, keeps source, and writes history', async () => {
    const dir = await tempDir()
    await writeFileAged(join(dir, 'src.js'), 'keep', 1)
    await mkdir(join(dir, 'node_modules'))
    await writeFile(join(dir, 'node_modules', 'a.js'), 'x')
    const historyFile = join(dir, 'state', 'history.jsonl')

    const plan = buildPlan([project(dir, [join(dir, 'node_modules')])])
    const results = await executePlan(plan, { historyFile })

    expect(results[0]?.outcome.status).toBe('removed')
    expect(existsSync(join(dir, 'node_modules'))).toBe(false)
    expect(existsSync(join(dir, 'src.js'))).toBe(true)
    expect(existsSync(historyFile)).toBe(true)
  })

  it('does nothing on a dry run', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'node_modules'))

    const results = await executePlan(buildPlan([project(dir, [join(dir, 'node_modules')])]), {
      dryRun: true,
    })

    expect(results[0]?.outcome.status).toBe('dry-run')
    expect(existsSync(join(dir, 'node_modules'))).toBe(true)
  })

  it('never follows symlinks or leaves the scope', async () => {
    const dir = await tempDir()
    const outside = await tempDir()
    await writeFile(join(outside, 'precious.txt'), 'x')
    await symlink(outside, join(dir, 'node_modules'))

    const results = await executePlan(
      buildPlan([project(dir, [join(dir, 'node_modules'), outside])]),
    )

    expect(results.map((r) => r.outcome.status)).toEqual(['skipped', 'skipped'])
    expect(existsSync(join(outside, 'precious.txt'))).toBe(true)
  })
})

describe.runIf(process.platform === 'darwin')('swift DerivedData', () => {
  it('maps a DerivedData folder back to its project and scopes removal to DerivedData', async () => {
    const root = await tempDir()
    const derived = await tempDir()
    const proj = join(root, 'App')
    await writeFileAged(join(proj, 'Package.swift'), '', 200)
    await mkdir(join(proj, 'App.xcodeproj'), { recursive: true })

    const folder = join(derived, 'App-abcdef')
    await mkdir(folder, { recursive: true })
    execFileSync('plutil', ['-create', 'xml1', join(folder, 'info.plist')])
    execFileSync('plutil', [
      '-insert',
      'WorkspacePath',
      '-string',
      join(proj, 'App.xcodeproj'),
      join(folder, 'info.plist'),
    ])
    await mkdir(join(derived, 'Other-zzz'), { recursive: true })

    const artifacts = await createSwiftType({ derivedDataDir: derived }).findArtifacts(proj)
    expect(artifacts).toEqual([
      { path: folder, label: 'DerivedData', safety: 'always', scope: derived },
    ])

    const report = await scan({
      config: testConfig([root]),
      types: createProjectTypes({ derivedDataDir: derived }),
    })
    const item = report.projects[0]?.artifacts[0]
    expect(item?.scope).toBe(derived)
    expect(removalBlocker(item?.path ?? '', item?.scope ?? '')).toBeNull()
  })
})
