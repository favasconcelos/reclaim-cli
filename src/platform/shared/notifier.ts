import { createRequire } from 'node:module'
import type { Notification, Notifier } from '@/platform/types'

const require = createRequire(import.meta.url)

interface NodeNotifierLike {
  notify(
    notification: { title?: string; message?: string },
    callback?: (error: Error | null, response: string) => void,
  ): unknown
}

const nodeNotifier = require('node-notifier') as NodeNotifierLike

/**
 * Cross-platform notifier backed by `node-notifier`.
 *
 * Picks Notification Center on macOS, toasts on Windows 8+ and `notify-send`
 * on Linux. Rejects when the OS reports a failure so callers can warn.
 */
export function createNotifier(): Notifier {
  return {
    async notify(notification: Notification): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        try {
          nodeNotifier.notify(
            { title: notification.title, message: notification.message },
            (error) => {
              if (error) reject(new Error(String((error as Error).message ?? error)))
              else resolve()
            },
          )
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    },
  }
}
