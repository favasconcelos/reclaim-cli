import type { Notification, Notifier } from '@/platform/types'
import { run } from '@/util/exec'

const escapeAppleScript = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/** Uses terminal-notifier when it is installed and allowed, otherwise plain osascript. */
export function createMacNotifier(): Notifier {
  return {
    async notify({ title, message }: Notification) {
      let failure = ''
      if ((await run('which', ['terminal-notifier'])).ok) {
        const result = await run('terminal-notifier', [
          '-title',
          title,
          '-message',
          message,
          '-group',
          'stale',
        ])
        if (result.ok && !/turned off|not allowed/i.test(result.stdout + result.stderr)) return
        failure = (result.stderr || result.stdout).trim().split('\n')[0] ?? ''
      }

      const result = await run('osascript', [
        '-e',
        `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}"`,
      ])
      if (!result.ok) {
        throw new Error(failure || result.stderr.trim() || 'Could not send the notification')
      }
    },
  }
}
