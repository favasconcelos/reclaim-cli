# reclaim-cli

Finds projects you haven't touched in a while and reclaims the disk space taken by their
regenerable build output (`node_modules`, `.build`, `DerivedData`, Gradle `build`, …).
Source files are never touched.

macOS only for now. Supports Node.js, Swift (SwiftPM / Xcode) and Android (Gradle) projects.

## Install

```sh
npm install -g reclaim-cli
reclaim-cli init        # folders, thresholds, daily schedule, terminal reminder
```

To run from source instead: `npm ci && npm run build && npm link`.

## How it works

1. **Scan** – walks your watched folders and finds project roots (outermost marker wins, so a monorepo
   is one project).
2. **Judge** – a project is *stale* when its most recent sign of life is older than `staleAfterDays`
   (default 60). Signs of life: newest source-file mtime (artifact folders excluded), last commit, last
   change to `.git/HEAD` / `.git/index`.
3. **Measure** – sizes the artifacts of stale projects with `du`.
4. **Remind** – the daily job writes `~/.local/state/reclaim-cli/pending` and sends a notification when at
   least `minReclaimableMB` can be reclaimed. A tiny zsh hook prints that line when you open a terminal.
5. **Clean** – `reclaim-cli review` (interactive) or `reclaim-cli clean` removes only artifacts.

### What counts as an artifact

| Type | Always removed | Removed only if git-ignored |
|---|---|---|
| Node | `node_modules`, `.next`, `.nuxt`, `.turbo`, `.svelte-kit`, `.parcel-cache` | `dist`, `build`, `out`, `coverage` |
| Swift | `.build`, matching `~/Library/Developer/Xcode/DerivedData/<project>-<hash>` | `.swiftpm`, `Pods`, `Carthage/Build` |
| Android | `build`, `.gradle`, `.cxx` next to a Gradle file | – |

### Safety

- Stale projects with **uncommitted changes** or **unpushed commits** (repos with a remote) are listed
  but skipped. Disable with `reclaim-cli config set skipDirty false`.
- A removal must be strictly inside its project (or DerivedData for Xcode); symlinks are never followed.
- `reclaim-cli clean --dry-run` shows exactly what would be removed. Every removal is logged (`reclaim-cli log`).

## Commands

```
reclaim-cli init                         interactive setup
reclaim-cli add|remove <folder>          manage watched folders
reclaim-cli ignore <path> [--remove]     never report a project at/below this path
reclaim-cli scan [--all] [--json] [--quiet] [--notify]
reclaim-cli review                       pick projects to clean interactively
reclaim-cli clean [paths…] [--dry-run] [-y]
reclaim-cli schedule install|uninstall|status [--at HH:mm]
reclaim-cli hook install|print           terminal reminder + completion for new zsh shells
reclaim-cli completion zsh               print the zsh completion script
reclaim-cli snooze <3d|12h> | --clear    mute reminders
reclaim-cli log [-n 20]                  history of removals
reclaim-cli config get [key] | set <key> <value>
```

### Terminal reminder and zsh completion

`reclaim-cli init` offers to set this up, or run it yourself:

```sh
reclaim-cli hook install
```

This writes `~/.config/reclaim-cli/hook.zsh` and adds one line to `~/.zshrc` that sources it. The script is
pure zsh, so opening a terminal never starts Node and nothing breaks if `reclaim-cli` is not on your PATH.
On the first prompt it prints the pending reminder (compatible with Powerlevel10k's instant prompt, reminders
older than 3 days are ignored) and registers tab completion for `reclaim-cli`:

- commands and subcommands, with descriptions (`reclaim-cli sch<TAB>`, `reclaim-cli schedule <TAB>`)
- flags with descriptions (`reclaim-cli scan --<TAB>`)
- folders for `add`, `remove`, `ignore` and `clean`; setting names for `config get|set`, and `true`/`false`
  for boolean settings

The completion is generated from the CLI's own command tree. After upgrading, run
`reclaim-cli hook install` again to refresh it. It needs zsh's completion system (`compinit`), which
frameworks such as oh-my-zsh already enable.

Prefer to wire it up yourself? `source <(reclaim-cli completion zsh)` after `compinit` does the same.

### Daily schedule

`reclaim-cli schedule install` writes a launchd agent (`dev.reclaim-cli.daily`) that runs
`reclaim-cli scan --notify --quiet` at `scheduleAt`. The agent stores the absolute path to Node and to
`reclaim-cli`; if you switch Node versions, run `reclaim-cli schedule install` again (`reclaim-cli schedule status`
tells you when it's broken). If macOS blocks notifications, enable them under
System Settings → Notifications (for `terminal-notifier` if installed, otherwise Script Editor).

## Configuration

`~/.config/reclaim-cli/config.json` (state in `~/.local/state/reclaim-cli/`). Override locations with
`RECLAIM_CLI_CONFIG_DIR` / `RECLAIM_CLI_STATE_DIR`.

| Key | Default | |
|---|---|---|
| `roots` | `[]` | folders to scan |
| `staleAfterDays` | `60` | idle days before a project is stale |
| `minReclaimableMB` | `500` | minimum total before reminding |
| `scheduleAt` | `"10:00"` | daily scan time |
| `notify` | `true` | native notification from the daily scan |
| `skipDirty` | `true` | skip projects with uncommitted/unpushed work |
| `maxDepth` | `4` | how deep to look for project roots |
| `types` | `["node","swift","android"]` | enabled project types |
| `ignore` | `[]` | paths to skip |

## Extending

- **New project type**: implement `ProjectType` (`src/core/types.ts`) in `src/types/` and register it in
  `src/types/index.ts`.
- **New OS**: implement `Platform` (`src/platform/types.ts`: paths, scheduler, notifier, shell hook) and
  return it from `src/platform/index.ts`.

## Development

```sh
npm run dev         # rebuild on change
npm test            # vitest
npm run typecheck
npm run lint        # biome
```

## Releasing

Releases are published to npm from GitHub with [trusted publishing](https://docs.npmjs.com/trusted-publishers)
(no npm token). The workflow is `.github/workflows/release.yml`.

```sh
npm version patch|minor|major        # bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
gh release create vX.Y.Z --generate-notes
```

Publishing the GitHub Release triggers the workflow, which checks that the tag matches
`package.json`, runs lint, typecheck, tests and build, then runs `npm publish`. Mark the release as a
pre-release to publish it under the `next` dist-tag instead of `latest`.

## License

MIT
