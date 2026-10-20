import { join } from 'node:path'
import { findDirsWith, isRealDirectory } from '@/core/fs'
import type { Artifact, ProjectType } from '@/core/types'

const GRADLE_FILES = ['settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts']
const hasGradleFile = (entries: readonly string[]) => entries.some((e) => GRADLE_FILES.includes(e))

export const androidType: ProjectType = {
  id: 'android',
  label: 'Android',
  isRoot: hasGradleFile,
  async findArtifacts(root) {
    const dirs = await findDirsWith(root, hasGradleFile, 3)
    const artifacts: Artifact[] = []
    for (const dir of dirs) {
      for (const name of ['build', '.gradle', '.cxx']) {
        const path = join(dir, name)
        if (await isRealDirectory(path)) artifacts.push({ path, label: name, safety: 'always' })
      }
    }
    return artifacts
  },
}
