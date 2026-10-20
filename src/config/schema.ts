import { z } from 'zod'

export const configSchema = z.object({
  roots: z.array(z.string()).default([]),
  staleAfterDays: z.number().int().positive().default(60),
  minReclaimableMB: z.number().nonnegative().default(500),
  scheduleAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm (24h)')
    .default('10:00'),
  notify: z.boolean().default(true),
  skipDirty: z.boolean().default(true),
  maxDepth: z.number().int().min(0).max(10).default(4),
  types: z.array(z.string()).default(['node', 'swift', 'android']),
  ignore: z.array(z.string()).default([]),
})

export type Config = z.infer<typeof configSchema>
export type ConfigKey = keyof Config

export const SCALAR_KEYS = [
  'staleAfterDays',
  'minReclaimableMB',
  'scheduleAt',
  'notify',
  'skipDirty',
  'maxDepth',
] as const satisfies readonly ConfigKey[]
