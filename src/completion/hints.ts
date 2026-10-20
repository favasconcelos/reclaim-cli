import { configSchema, SCALAR_KEYS } from '@/config/schema'

/** How a positional argument should be completed. */
export type ArgHint =
  | { type: 'dirs' }
  | { type: 'values'; values: string[] }
  /** Values depend on an earlier positional argument (1-based), e.g. `config set <key> <value>`. */
  | { type: 'by-arg'; arg: number; map: Record<string, string[]> }

/** Keyed by command path, e.g. `add` or `config set`. One entry per positional argument. */
export type Hints = Record<string, ArgHint[]>

export function defaultHints(): Hints {
  const booleanKeys = Object.entries(configSchema.parse({}))
    .filter(([, value]) => typeof value === 'boolean')
    .map(([key]) => key)

  return {
    add: [{ type: 'dirs' }],
    remove: [{ type: 'dirs' }],
    ignore: [{ type: 'dirs' }],
    clean: [{ type: 'dirs' }],
    snooze: [{ type: 'values', values: ['30m', '1h', '12h', '1d', '3d', '1w'] }],
    'config get': [{ type: 'values', values: Object.keys(configSchema.shape) }],
    'config set': [
      { type: 'values', values: [...SCALAR_KEYS] },
      {
        type: 'by-arg',
        arg: 1,
        map: Object.fromEntries(booleanKeys.map((key) => [key, ['true', 'false']])),
      },
    ],
    completion: [{ type: 'values', values: ['zsh'] }],
  }
}
