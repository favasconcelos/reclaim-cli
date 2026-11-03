import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // node-notifier ships prebuilt vendor binaries resolved relative to its
  // own files; keep it external so those paths survive bundling.
  external: ['node-notifier'],
  banner: { js: '#!/usr/bin/env node' },
})
