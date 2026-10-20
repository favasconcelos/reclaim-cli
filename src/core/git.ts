import type { GitState } from '@/core/types'
import { run } from '@/util/exec'

export async function isGitIgnored(root: string, path: string): Promise<boolean> {
  const result = await run('git', ['check-ignore', '-q', '--', path], {
    cwd: root,
    timeoutMs: 15_000,
  })
  return result.code === 0
}

export async function readGitState(root: string): Promise<GitState> {
  const top = await run('git', ['rev-parse', '--show-toplevel'], { cwd: root, timeoutMs: 15_000 })
  if (!top.ok) return { isRepo: false, dirty: false, unpushed: false, lastCommitMs: null }

  const [status, remotes, unpushed, last] = await Promise.all([
    // --no-optional-locks: a plain `git status` rewrites .git/index, which would look like activity.
    run('git', ['--no-optional-locks', 'status', '--porcelain', '--', '.'], { cwd: root }),
    run('git', ['remote'], { cwd: root }),
    run('git', ['rev-list', '--count', 'HEAD', '--not', '--remotes', '--', '.'], { cwd: root }),
    run('git', ['log', '-1', '--format=%ct', '--', '.'], { cwd: root }),
  ])

  const lastSeconds = Number.parseInt(last.stdout.trim(), 10)
  return {
    isRepo: true,
    dirty: status.ok && status.stdout.trim().length > 0,
    // Without a remote there is nothing to push to, so only repos that have one can have unpushed commits.
    unpushed:
      remotes.ok &&
      remotes.stdout.trim().length > 0 &&
      unpushed.ok &&
      Number.parseInt(unpushed.stdout.trim(), 10) > 0,
    lastCommitMs: Number.isFinite(lastSeconds) ? lastSeconds * 1000 : null,
  }
}
