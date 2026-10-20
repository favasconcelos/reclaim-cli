import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverProjects, scan } from '@/core/scan'
import { createProjectTypes } from '@/types'
import { backdate, gitInitAged, tempDir, testConfig, writeFileAged } from './helpers'

const OLD = 200

async function nodeProject(root: string, name: string, age: number) {
  const dir = join(root, name)
  await writeFileAged(join(dir, 'package.json'), '{}', age)
  await writeFileAged(join(dir, 'src', 'index.js'), 'x', age)
  await mkdir(join(dir, 'node_modules', 'dep'), { recursive: true })
  await writeFile(join(dir, 'node_modules', 'dep', 'index.js'), 'x'.repeat(10_000))
  return dir
}

async function run(root: string, overrides = {}) {
  return scan({
    config: testConfig([root], overrides),
    types: createProjectTypes({ derivedDataDir: join(root, '__no_derived_data__') }),
    includeActive: true,
  })
}

describe('scan', () => {
  it('flags idle projects as stale and recent ones as active', async () => {
    const root = await tempDir()
    await nodeProject(root, 'old', OLD)
    await nodeProject(root, 'fresh', 1)

    const report = await run(root)
    const byName = Object.fromEntries(report.projects.map((p) => [p.name, p]))

    expect(byName.old?.stale).toBe(true)
    expect(byName.old?.reclaimableBytes).toBeGreaterThan(0)
    expect(byName.fresh?.stale).toBe(false)
    expect(byName.fresh?.reclaimableBytes).toBe(0)
    expect(report.totals.staleProjects).toBe(1)
    expect(report.totals.reclaimableBytes).toBe(byName.old?.reclaimableBytes)
  })

  it('ignores artifact folders when judging activity', async () => {
    const root = await tempDir()
    const dir = await nodeProject(root, 'old', OLD)
    // A fresh file inside node_modules (e.g. a recent `npm install`) must not count as activity.
    await writeFile(join(dir, 'node_modules', 'dep', 'fresh.js'), 'x')

    const report = await run(root)
    expect(report.projects[0]?.stale).toBe(true)
  })

  it('treats a recent commit as activity even when files are old', async () => {
    const root = await tempDir()
    const dir = await nodeProject(root, 'proj', OLD)
    await writeFile(join(dir, '.gitignore'), 'node_modules\n')
    await backdate(join(dir, '.gitignore'), OLD)
    gitInitAged(dir, 2)

    const report = await run(root)
    expect(report.projects[0]?.stale).toBe(false)
  })

  it('only offers build output that git ignores', async () => {
    const root = await tempDir()
    const dir = await nodeProject(root, 'proj', OLD)
    await writeFileAged(join(dir, 'dist', 'bundle.js'), 'x', OLD)
    await writeFileAged(join(dir, 'build', 'tracked.js'), 'x', OLD)
    await writeFileAged(join(dir, '.gitignore'), 'node_modules\ndist\n', OLD)
    gitInitAged(dir, OLD)

    const labels = (await run(root)).projects[0]?.artifacts.map((a) => a.label).sort()
    expect(labels).toEqual(['dist', 'node_modules'])
  })

  it('does not offer dist/build when the project is not a git repo', async () => {
    const root = await tempDir()
    const dir = await nodeProject(root, 'proj', OLD)
    await writeFileAged(join(dir, 'dist', 'bundle.js'), 'x', OLD)

    const labels = (await run(root)).projects[0]?.artifacts.map((a) => a.label)
    expect(labels).toEqual(['node_modules'])
  })

  it('protects stale projects with uncommitted changes', async () => {
    const root = await tempDir()
    const dir = await nodeProject(root, 'proj', OLD)
    await writeFileAged(join(dir, '.gitignore'), 'node_modules\n', OLD)
    gitInitAged(dir, OLD)
    await writeFileAged(join(dir, 'src', 'new.js'), 'wip', OLD)

    const project = (await run(root)).projects[0]
    expect(project?.stale).toBe(true)
    expect(project?.protectedReason).toBe('uncommitted changes')
    expect(project?.reclaimableBytes).toBe(0)

    const relaxed = (await run(root, { skipDirty: false })).projects[0]
    expect(relaxed?.protectedReason).toBeNull()
    expect(relaxed?.reclaimableBytes).toBeGreaterThan(0)
  })

  it('does not count a local-only git repo as having unpushed commits', async () => {
    const root = await tempDir()
    const dir = await nodeProject(root, 'proj', OLD)
    await writeFileAged(join(dir, '.gitignore'), 'node_modules\n', OLD)
    gitInitAged(dir, OLD)

    const project = (await run(root)).projects[0]
    expect(project?.git.unpushed).toBe(false)
    expect(project?.protectedReason).toBeNull()
  })

  it('honours the ignore list', async () => {
    const root = await tempDir()
    await nodeProject(root, 'keep', OLD)
    await nodeProject(root, 'drop', OLD)

    const report = await run(root, { ignore: [join(root, 'keep')] })
    expect(report.projects.map((p) => p.name)).toEqual(['drop'])
  })

  it('skips projects that have nothing to clean', async () => {
    const root = await tempDir()
    await writeFileAged(join(root, 'bare', 'package.json'), '{}', OLD)

    expect((await run(root)).projects).toEqual([])
  })
})

describe('discoverProjects', () => {
  it('stops at the outermost project root (monorepo = one project)', async () => {
    const root = await tempDir()
    await writeFileAged(join(root, 'mono', 'package.json'), '{}', 1)
    await writeFileAged(join(root, 'mono', 'packages', 'a', 'package.json'), '{}', 1)
    await writeFileAged(join(root, 'plain', 'notes.txt'), 'x', 1)

    const found = await discoverProjects([root], createProjectTypes(), 4)
    expect(found.map((p) => p.root)).toEqual([join(root, 'mono')])
  })

  it('detects node, swift and android roots', async () => {
    const root = await tempDir()
    await writeFileAged(join(root, 'n', 'package.json'), '{}', 1)
    await writeFileAged(join(root, 's', 'Package.swift'), '', 1)
    await mkdir(join(root, 'x', 'App.xcodeproj'), { recursive: true })
    await writeFileAged(join(root, 'a', 'settings.gradle.kts'), '', 1)

    const found = await discoverProjects([root], createProjectTypes(), 4)
    const types = Object.fromEntries(
      found.map((p) => [p.root.slice(root.length + 1), p.types[0]?.id]),
    )
    expect(types).toEqual({ a: 'android', n: 'node', s: 'swift', x: 'swift' })
  })
})

describe('mixed projects', () => {
  it('finds android build output inside a React Native style project', async () => {
    const root = await tempDir()
    const dir = join(root, 'rn')
    await writeFileAged(join(dir, 'package.json'), '{}', OLD)
    await writeFileAged(join(dir, 'android', 'build.gradle'), '', OLD)
    await writeFileAged(join(dir, 'android', 'app', 'build.gradle'), '', OLD)
    await writeFileAged(join(dir, 'android', 'app', 'build', 'out.apk'), 'x'.repeat(1000), OLD)
    await mkdir(join(dir, 'node_modules', 'x'), { recursive: true })
    await writeFile(join(dir, 'node_modules', 'x', 'i.js'), 'x')

    const project = (await run(root)).projects[0]
    expect(project?.types).toEqual(['android', 'node'])
    expect(project?.artifacts.map((a) => a.label).sort()).toEqual([
      'android/app/build',
      'node_modules',
    ])
  })
})
