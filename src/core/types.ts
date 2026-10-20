export interface Artifact {
  /** Absolute path of the regenerable directory. */
  path: string
  /** Short human label, e.g. "node_modules". */
  label: string
  /**
   * `always`: safe to remove unconditionally (pure cache / dependency dir).
   * `if-gitignored`: only eligible when git confirms the path is ignored.
   */
  safety: 'always' | 'if-gitignored'
  /** Directory that must strictly contain `path` for removal. Defaults to the project root. */
  scope?: string
}

export interface ProjectType {
  id: string
  label: string
  /** Does a directory with these entry names look like the root of this kind of project? */
  isRoot(entries: readonly string[]): boolean
  /** Regenerable directories inside (or belonging to) the project at `root`. */
  findArtifacts(root: string): Promise<Artifact[]>
}

export interface GitState {
  isRepo: boolean
  dirty: boolean
  unpushed: boolean
  lastCommitMs: number | null
}

export interface ArtifactReport {
  path: string
  label: string
  sizeBytes: number
  scope: string
}

export type ProtectedReason = 'uncommitted changes' | 'unpushed commits'

export interface ProjectReport {
  path: string
  name: string
  types: string[]
  lastActivityMs: number
  idleDays: number
  stale: boolean
  git: GitState
  artifacts: ArtifactReport[]
  /** Set when the project is stale but must not be cleaned automatically. */
  protectedReason: ProtectedReason | null
  /** Bytes that can be reclaimed now (0 for active or protected projects). */
  reclaimableBytes: number
}

export interface ScanReport {
  generatedAt: string
  staleAfterDays: number
  roots: string[]
  projects: ProjectReport[]
  totals: {
    projectsScanned: number
    staleProjects: number
    reclaimableBytes: number
  }
}
