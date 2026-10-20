import { homedir } from 'node:os'
import { join } from 'node:path'
import { findDirsWith, isRealDirectory, readEntries } from '@/core/fs'
import type { Artifact, ProjectType } from '@/core/types'
import { run } from '@/util/exec'
import { isInside } from '@/util/path'

const isXcodeEntry = (name: string) =>
  name.endsWith('.xcodeproj') || name.endsWith('.xcworkspace') || name === 'Podfile'
const isSwiftPackage = (entries: readonly string[]) => entries.includes('Package.swift')
const isSwiftRoot = (entries: readonly string[]) =>
  isSwiftPackage(entries) || entries.some(isXcodeEntry)

export const defaultDerivedDataDir = () =>
  join(homedir(), 'Library', 'Developer', 'Xcode', 'DerivedData')

/** Maps each Xcode DerivedData folder to the workspace/project it was built from. */
async function indexDerivedData(dir: string): Promise<Map<string, string>> {
  const index = new Map<string, string>()
  for (const entry of await readEntries(dir)) {
    if (!entry.isDirectory()) continue
    const folder = join(dir, entry.name)
    const result = await run(
      'plutil',
      ['-extract', 'WorkspacePath', 'raw', '-o', '-', join(folder, 'info.plist')],
      {
        timeoutMs: 10_000,
      },
    )
    const workspace = result.stdout.trim()
    if (result.ok && workspace) index.set(workspace, folder)
  }
  return index
}

export function createSwiftType(options: { derivedDataDir?: string } = {}): ProjectType {
  const derivedDataDir = options.derivedDataDir ?? defaultDerivedDataDir()
  let derivedIndex: Promise<Map<string, string>> | undefined

  return {
    id: 'swift',
    label: 'Swift',
    isRoot: isSwiftRoot,
    async findArtifacts(root) {
      const artifacts: Artifact[] = []

      for (const dir of await findDirsWith(root, isSwiftPackage, 3)) {
        const build = join(dir, '.build')
        if (await isRealDirectory(build))
          artifacts.push({ path: build, label: '.build', safety: 'always' })
        const swiftpm = join(dir, '.swiftpm')
        if (await isRealDirectory(swiftpm))
          artifacts.push({ path: swiftpm, label: '.swiftpm', safety: 'if-gitignored' })
      }

      for (const dir of await findDirsWith(root, (entries) => entries.some(isXcodeEntry), 3)) {
        for (const name of ['Pods', join('Carthage', 'Build')]) {
          const path = join(dir, name)
          if (await isRealDirectory(path))
            artifacts.push({ path, label: name, safety: 'if-gitignored' })
        }
      }

      if (process.platform === 'darwin' && (await isRealDirectory(derivedDataDir))) {
        derivedIndex ??= indexDerivedData(derivedDataDir)
        for (const [workspace, folder] of await derivedIndex) {
          if (workspace === root || isInside(workspace, root)) {
            artifacts.push({
              path: folder,
              label: 'DerivedData',
              safety: 'always',
              scope: derivedDataDir,
            })
          }
        }
      }

      return artifacts
    },
  }
}
