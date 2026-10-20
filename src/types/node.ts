import { join } from 'node:path'
import { findDirsWith, isRealDirectory } from '@/core/fs'
import type { Artifact, ProjectType } from '@/core/types'

const ALWAYS = ['node_modules', '.next', '.nuxt', '.turbo', '.svelte-kit', '.parcel-cache']
const IF_IGNORED = ['dist', 'build', 'out', 'coverage']

export const nodeType: ProjectType = {
  id: 'node',
  label: 'Node.js',
  isRoot: (entries) => entries.includes('package.json'),
  async findArtifacts(root) {
    const dirs = await findDirsWith(root, (entries) => entries.includes('package.json'), 3)
    const artifacts: Artifact[] = []
    for (const dir of dirs) {
      for (const [names, safety] of [
        [ALWAYS, 'always'],
        [IF_IGNORED, 'if-gitignored'],
      ] as const) {
        for (const name of names) {
          const path = join(dir, name)
          if (await isRealDirectory(path)) artifacts.push({ path, label: name, safety })
        }
      }
    }
    return artifacts
  },
}
