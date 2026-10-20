import { styleText } from 'node:util'

export const DAY_MS = 24 * 60 * 60 * 1000

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = -1
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

export function formatIdle(days: number): string {
  if (days < 1) return 'today'
  if (days < 60) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

export function parseDuration(input: string): number {
  const match = /^(\d+)\s*([mhdw])$/i.exec(input.trim())
  if (!match) throw new Error(`Invalid duration "${input}". Use forms like 30m, 12h, 3d, 2w.`)
  const amount = Number(match[1])
  const unit = (match[2] as string).toLowerCase()
  const factor = { m: 60_000, h: 3_600_000, d: DAY_MS, w: 7 * DAY_MS }[unit] as number
  return amount * factor
}

export const c = {
  bold: (s: string) => styleText('bold', s),
  dim: (s: string) => styleText('dim', s),
  red: (s: string) => styleText('red', s),
  green: (s: string) => styleText('green', s),
  yellow: (s: string) => styleText('yellow', s),
  cyan: (s: string) => styleText('cyan', s),
}
