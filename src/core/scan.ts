import { stat } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import type { Config } from '@/config/schema'
import { lastActivity } from '@/core/activity'
import { isHeavyDir, isRealDirectory, readEntries } from '@/core/fs'
import { isGitIgnored, readGitState } from '@/core/git'
import { sizeOf } from '@/core/size'
import type {
  Artifact,
  ArtifactReport,
  ProjectReport,
  ProjectType,
  ProtectedReason,
  ScanReport,
} from '@/core/types'
import { mapLimit } from '@/util/concurrency'
import { DAY_MS } from '@/util/format'
import { expandHome, isInside } from '@/util/path'

/** Directories that never contain projects worth scanning. */
const DISCOVERY_SKIP = new Set(['Library', 'Applications', 'Pictures', 'Music', 'Movies'])

export interface DiscoveredProject {
  root: string
  types: ProjectType[]
}

export interface ScanOptions {
  config: Config
  types: ProjectType[]
  now?: number
  /** Also measure and report projects that are still active. */
  includeActive?: boolean
  onProgress?: (message: string) => void
}

export function isIgnored(path: string, ignore: readonly string[]): boolean {
  return ignore.some((entry) => {
    const target = resolve(expandHome(entry))
    return path === target || isInside(path, target)
  })
}

/** Finds the outermost project root under each folder; a root is never searched further. */
export async function discoverProjects(
  roots: readonly string[],
  types: readonly ProjectType[],
  maxDepth: number,
  ignore: readonly string[] = [],
): Promise<DiscoveredProject[]> {
  const found = new Map<string, DiscoveredProject>()

  const visit = async (dir: string, depth: number): Promise<void> => {
    if (isIgnored(dir, ignore)) return
    const entries = await readEntries(dir)
    const names = entries.map((e) => e.name)
    const matched = types.filter((type) => type.isRoot(names))
    if (matched.length > 0) {
      found.set(dir, { root: dir, types: matched })
      return
    }
    if (depth >= maxDepth) return
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || isHeavyDir(entry.name) || DISCOVERY_SKIP.has(entry.name))
        continue
      await visit(resolve(dir, entry.name), depth + 1)
    }
  }

  for (const root of roots) {
    if (await isRealDirectory(root)) await visit(root, 0)
  }
  return [...found.values()].sort((a, b) => a.root.localeCompare(b.root))
}

interface Collected {
  artifacts: Artifact[]
  typeIds: Set<string>
}

async function collectArtifacts(root: string, types: readonly ProjectType[]): Promise<Collected> {
  const byPath = new Map<string, { artifact: Artifact; typeId: string }>()
  for (const type of types) {
    for (const artifact of await type.findArtifacts(root)) {
      if (!byPath.has(artifact.path)) byPath.set(artifact.path, { artifact, typeId: type.id })
    }
  }
  const all = [...byPath.values()]
  // Drop artifacts that live inside another artifact; removing the parent covers them.
  const kept = all.filter(
    (a) => !all.some((b) => b !== a && isInside(a.artifact.path, b.artifact.path)),
  )

  const collected: Collected = { artifacts: [], typeIds: new Set() }
  for (const { artifact, typeId } of kept) {
    if (artifact.safety === 'always' || (await isGitIgnored(root, artifact.path))) {
      collected.artifacts.push(artifact)
      collected.typeIds.add(typeId)
    }
  }
  return collected
}

async function analyzeProject(
  project: DiscoveredProject,
  allTypes: readonly ProjectType[],
  options: ScanOptions,
  now: number,
): Promise<ProjectReport | null> {
  const { config } = options
  const { root } = project

  const { artifacts, typeIds } = await collectArtifacts(root, allTypes)
  if (artifacts.length === 0) return null
  for (const type of project.types) typeIds.add(type.id)

  const git = await readGitState(root)
  const cutoff = now - config.staleAfterDays * DAY_MS
  const lastActivityMs = await lastActivity(root, {
    exclude: artifacts.map((a) => a.path),
    earlyExitAfter: cutoff,
    lastCommitMs: git.lastCommitMs,
  })
  const stale = lastActivityMs <= cutoff

  let protectedReason: ProtectedReason | null = null
  if (stale && config.skipDirty) {
    if (git.dirty) protectedReason = 'uncommitted changes'
    else if (git.unpushed) protectedReason = 'unpushed commits'
  }

  const labelOf = (artifact: Artifact) =>
    isInside(artifact.path, root) ? relative(root, artifact.path) : artifact.label

  const measured: ArtifactReport[] =
    stale || options.includeActive
      ? await mapLimit(artifacts, 4, async (artifact) => ({
          path: artifact.path,
          label: labelOf(artifact),
          scope: artifact.scope ?? root,
          sizeBytes: await sizeOf(artifact.path),
        }))
      : artifacts.map((artifact) => ({
          path: artifact.path,
          label: labelOf(artifact),
          scope: artifact.scope ?? root,
          sizeBytes: 0,
        }))

  const total = measured.reduce((sum, a) => sum + a.sizeBytes, 0)
  options.onProgress?.(root)
  return {
    path: root,
    name: basename(root),
    types: [...typeIds].sort(),
    lastActivityMs,
    idleDays: Math.max(0, Math.floor((now - lastActivityMs) / DAY_MS)),
    stale,
    git,
    artifacts: measured,
    protectedReason,
    reclaimableBytes: stale && !protectedReason ? total : 0,
  }
}

export async function scan(options: ScanOptions): Promise<ScanReport> {
  const now = options.now ?? Date.now()
  const { config, types } = options
  const roots = config.roots.map((r) => resolve(expandHome(r)))
  const existing: string[] = []
  for (const root of roots) {
    try {
      if ((await stat(root)).isDirectory()) existing.push(root)
    } catch {
      // Missing folders are skipped; `stale scan` reports them separately.
    }
  }

  const discovered = await discoverProjects(existing, types, config.maxDepth, config.ignore)
  const analyzed = await mapLimit(discovered, 4, (project) =>
    analyzeProject(project, types, options, now),
  )
  const projects = analyzed.filter((p): p is ProjectReport => p !== null)

  const actionable = projects.filter((p) => p.stale && !p.protectedReason)
  return {
    generatedAt: new Date(now).toISOString(),
    staleAfterDays: config.staleAfterDays,
    roots,
    projects,
    totals: {
      projectsScanned: discovered.length,
      staleProjects: actionable.length,
      reclaimableBytes: actionable.reduce((sum, p) => sum + p.reclaimableBytes, 0),
    },
  }
}
