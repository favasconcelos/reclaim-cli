import { run } from '@/util/exec'

/** Disk usage in bytes (allocated blocks, like Finder), via `du`. */
export async function sizeOf(path: string): Promise<number> {
  const result = await run('du', ['-sk', path], { timeoutMs: 300_000 })
  const kb = Number.parseInt(result.stdout.split(/\s+/)[0] ?? '', 10)
  return Number.isFinite(kb) ? kb * 1024 : 0
}
