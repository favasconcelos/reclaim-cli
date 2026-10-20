export interface Notification {
  title: string
  message: string
}

export interface Notifier {
  notify(notification: Notification): Promise<void>
}

export interface ScheduleInstallOptions {
  /** Local time, HH:mm. */
  at: string
  /** Absolute command to run: [node, script, ...args]. */
  command: string[]
  logDir: string
}

export interface ScheduleStatus {
  installed: boolean
  loaded: boolean
  at?: string
  command?: string[]
  /** Human-readable problems, e.g. a Node path that no longer exists. */
  problems: string[]
}

export interface Scheduler {
  install(options: ScheduleInstallOptions): Promise<void>
  uninstall(): Promise<boolean>
  status(): Promise<ScheduleStatus>
}

export interface ShellHook {
  shell: string
  /** Startup file the hook line should live in, e.g. ~/.zshrc. */
  rcFile: string
  /** File that holds the hook script; the rc line sources it. */
  scriptFile: string
  /** Line to add to the rc file. It must not require `reclaim-cli` on PATH. */
  rcLine: string
  /** Lines written by older versions that should be replaced by `rcLine`. */
  legacyRcLines: string[]
  /** Contents of `scriptFile`. */
  script(): string
}

export interface Platform {
  id: string
  paths: { configDir: string; stateDir: string }
  scheduler: Scheduler
  notifier: Notifier
  hook: ShellHook
}
