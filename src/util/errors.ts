/** An expected, user-facing failure: printed without a stack trace. */
export class ReclaimError extends Error {
  override name = 'ReclaimError'
}
