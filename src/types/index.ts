import type { ProjectType } from '@/core/types'
import { androidType } from '@/types/android'
import { nodeType } from '@/types/node'
import { createSwiftType } from '@/types/swift'

export interface TypeFactoryOptions {
  derivedDataDir?: string
}

/** Every known project type. Add new ecosystems here. */
export function createProjectTypes(options: TypeFactoryOptions = {}): ProjectType[] {
  return [nodeType, createSwiftType(options), androidType]
}

export function selectProjectTypes(
  ids: readonly string[],
  options: TypeFactoryOptions = {},
): ProjectType[] {
  return createProjectTypes(options).filter((type) => ids.includes(type.id))
}
