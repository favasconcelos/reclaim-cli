/** An expected, user-facing failure: printed without a stack trace. */
export class StaleError extends Error {
  override name = 'StaleError'
}
