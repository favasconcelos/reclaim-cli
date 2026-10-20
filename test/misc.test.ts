import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyScalar } from '@/config/store'
import {
  activeSnooze,
  applyRemovals,
  clearSnooze,
  reminderMessage,
  setSnooze,
  updatePending,
} from '@/core/state'
import type { ScanReport } from '@/core/types'
import { buildPlist, parsePlist } from '@/platform/macos/scheduler'
import { formatBytes, formatIdle, parseDuration } from '@/util/format'
import { tempDir, testConfig } from './helpers'

function report(reclaimableBytes: number, staleProjects: number): ScanReport {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterDays: 60,
    roots: [],
    projects: [],
    totals: { projectsScanned: staleProjects, staleProjects, reclaimableBytes },
  }
}

describe('terminal reminder (pending file)', () => {
  it('writes a one-line message when above the threshold', async () => {
    const state = await tempDir()
    const result = await updatePending(
      state,
      testConfig([], { minReclaimableMB: 500 }),
      report(14_200_000_000, 7),
    )

    expect(result.reason).toBe('pending')
    expect(result.message).toContain('14.2 GB')
    expect(existsSync(join(state, 'pending'))).toBe(true)
  })

  it('removes the file when below the threshold or nothing is stale', async () => {
    const state = await tempDir()
    const config = testConfig([], { minReclaimableMB: 500 })
    await updatePending(state, config, report(14_200_000_000, 7))
    await updatePending(state, config, report(100_000_000, 2))
    expect(existsSync(join(state, 'pending'))).toBe(false)
  })

  it('stays quiet while snoozed and resumes after the snooze is cleared', async () => {
    const state = await tempDir()
    const config = testConfig([], { minReclaimableMB: 1 })
    await setSnooze(state, Date.now() + 60_000)
    expect((await updatePending(state, config, report(5_000_000_000, 3))).reason).toBe('snoozed')

    await clearSnooze(state)
    expect(await activeSnooze(state)).toBeNull()
    expect((await updatePending(state, config, report(5_000_000_000, 3))).reason).toBe('pending')
  })

  it('pluralises the message', () => {
    expect(reminderMessage(report(2_000_000_000, 1))).toContain('1 project →')
    expect(reminderMessage(report(2_000_000_000, 2))).toContain('2 projects →')
  })
})

describe('applyRemovals', () => {
  it('drops cleaned artifacts and recomputes totals', () => {
    const base = report(30, 2)
    base.projects = ['a', 'b'].map((name) => ({
      path: `/p/${name}`,
      name,
      types: ['node'],
      lastActivityMs: 0,
      idleDays: 100,
      stale: true,
      git: { isRepo: false, dirty: false, unpushed: false, lastCommitMs: null },
      artifacts: [
        {
          path: `/p/${name}/node_modules`,
          label: 'node_modules',
          sizeBytes: 15,
          scope: `/p/${name}`,
        },
      ],
      protectedReason: null,
      reclaimableBytes: 15,
    }))

    const updated = applyRemovals(base, new Set(['/p/a/node_modules']))
    expect(updated.projects.map((p) => p.name)).toEqual(['b'])
    expect(updated.totals).toMatchObject({ staleProjects: 1, reclaimableBytes: 15 })
  })
})

describe('launchd plist', () => {
  it('round-trips schedule and command, escaping XML', () => {
    const command = ['/usr/local/bin/node', '/opt/a&b/stale.js', 'scan', '--notify']
    const xml = buildPlist({
      label: 'dev.stale.daily',
      programArguments: command,
      hour: 9,
      minute: 5,
      stdoutPath: '/tmp/out.log',
      stderrPath: '/tmp/err.log',
    })

    expect(xml).toContain('/opt/a&amp;b/stale.js')
    expect(parsePlist(xml)).toEqual({ at: '09:05', command })
  })
})

describe('config', () => {
  it('coerces scalar values and rejects bad ones', () => {
    const config = testConfig([])
    expect(applyScalar(config, 'staleAfterDays', '30').staleAfterDays).toBe(30)
    expect(applyScalar(config, 'notify', 'false').notify).toBe(false)
    expect(() => applyScalar(config, 'scheduleAt', '25:00')).toThrow()
    expect(() => applyScalar(config, 'staleAfterDays', '-1')).toThrow()
    expect(() => applyScalar(config, 'roots', 'x')).toThrow(/Unknown or non-scalar/)
  })
})

describe('formatting', () => {
  it('formats bytes, idle time and durations', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1_500_000)).toBe('1.5 MB')
    expect(formatBytes(14_200_000_000)).toBe('14.2 GB')
    expect(formatIdle(0)).toBe('today')
    expect(formatIdle(45)).toBe('45d')
    expect(formatIdle(120)).toBe('4mo')
    expect(parseDuration('3d')).toBe(3 * 86_400_000)
    expect(parseDuration('12h')).toBe(12 * 3_600_000)
    expect(() => parseDuration('soon')).toThrow()
  })
})
