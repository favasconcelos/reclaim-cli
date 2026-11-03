import { createBashHook } from '@/platform/linux/hook'
import { linuxPaths } from '@/platform/linux/paths'
import { createLinuxScheduler } from '@/platform/linux/scheduler'
import { createZshHook } from '@/platform/macos/hook'
import { macosPaths } from '@/platform/macos/paths'
import { createLaunchdScheduler } from '@/platform/macos/scheduler'
import { createNotifier } from '@/platform/shared/notifier'
import type { Platform } from '@/platform/types'
import { createPowerShellHook } from '@/platform/windows/hook'
import { windowsPaths } from '@/platform/windows/paths'
import { createWindowsScheduler } from '@/platform/windows/scheduler'
import { ReclaimError } from '@/util/errors'

export type { Platform } from '@/platform/types'

/** Picks the implementation for the current OS. */
export function getPlatform(): Platform {
  if (process.platform === 'darwin') {
    const paths = macosPaths()
    return {
      id: 'macos',
      paths,
      scheduler: createLaunchdScheduler(),
      notifier: createNotifier(),
      hook: createZshHook({ configDir: paths.configDir }),
    }
  }
  if (process.platform === 'linux') {
    const paths = linuxPaths()
    const usesZsh = (process.env.SHELL ?? '').endsWith('zsh')
    return {
      id: 'linux',
      paths,
      scheduler: createLinuxScheduler(),
      notifier: createNotifier(),
      hook: usesZsh
        ? createZshHook({ configDir: paths.configDir })
        : createBashHook({ configDir: paths.configDir }),
    }
  }
  if (process.platform === 'win32') {
    const paths = windowsPaths()
    return {
      id: 'windows',
      paths,
      scheduler: createWindowsScheduler(),
      notifier: createNotifier(),
      hook: createPowerShellHook({ configDir: paths.configDir }),
    }
  }
  throw new ReclaimError(
    `reclaim-cli currently supports macOS, Linux and Windows (detected "${process.platform}").`,
  )
}
