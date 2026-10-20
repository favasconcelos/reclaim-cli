import { createZshHook } from '@/platform/macos/hook'
import { createMacNotifier } from '@/platform/macos/notifier'
import { macosPaths } from '@/platform/macos/paths'
import { createLaunchdScheduler } from '@/platform/macos/scheduler'
import type { Platform } from '@/platform/types'
import { StaleError } from '@/util/errors'

export type { Platform } from '@/platform/types'

/** Picks the implementation for the current OS. Add new platforms here. */
export function getPlatform(): Platform {
  if (process.platform === 'darwin') {
    return {
      id: 'macos',
      paths: macosPaths(),
      scheduler: createLaunchdScheduler(),
      notifier: createMacNotifier(),
      hook: createZshHook({ configDir: macosPaths().configDir }),
    }
  }
  throw new StaleError(`stale currently supports macOS only (detected "${process.platform}").`)
}
