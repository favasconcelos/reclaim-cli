import { createContext } from '@/cli/context'
import { clearPending, clearSnooze, setSnooze } from '@/core/state'
import { StaleError } from '@/util/errors'
import { c, parseDuration } from '@/util/format'

export async function snoozeCommand(
  duration: string | undefined,
  flags: { clear?: boolean },
): Promise<void> {
  const ctx = await createContext()
  if (flags.clear) {
    await clearSnooze(ctx.paths.stateDir)
    console.log('Reminders resumed. The next scan will bring them back.')
    return
  }
  if (!duration) throw new StaleError('Give a duration, e.g. `stale snooze 3d`, or use --clear.')
  const until = Date.now() + parseDuration(duration)
  await setSnooze(ctx.paths.stateDir, until)
  await clearPending(ctx.paths.stateDir)
  console.log(`${c.green('✔')} Reminders snoozed until ${new Date(until).toLocaleString()}.`)
}
