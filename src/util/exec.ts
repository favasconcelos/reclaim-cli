import { execFile } from 'node:child_process'

export interface RunResult {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
}

export function run(
  command: string,
  args: readonly string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...args],
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 120_000,
        maxBuffer: 16 * 1024 * 1024,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : null) : 0
        resolve({ ok: !error, code, stdout: stdout ?? '', stderr: stderr ?? '' })
      },
    )
  })
}
