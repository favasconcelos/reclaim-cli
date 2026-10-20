import type { Command, Option } from 'commander'
import type { ArgHint, Hints } from '@/completion/hints'

/** Single-quotes a string for zsh. */
const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`
/** Escapes text inside `[description]` of an _arguments spec. */
const describe = (value: string) => value.replace(/[\\[\]]/g, '\\$&')
/** Escapes the `message` part of an _arguments spec, where `:` is a separator. */
const message = (value: string) => value.replace(/[\\:]/g, '\\$&')
/** Escapes the name in a `_describe` entry (`name:description`). */
const entryName = (value: string) => value.replace(/[\\:]/g, '\\$&')

const functionName = (path: readonly string[]) =>
  `_${path.join('_').replace(/[^A-Za-z0-9_]/g, '_')}`

function optionSpec(option: Option): string {
  const description = describe(option.description ?? '')
  const argName = /[<[]([^>\]]+)[>\]]/.exec(option.flags)?.[1]
  const names = [option.short, option.long].filter((n): n is string => Boolean(n))
  const exclusive = `(${names.join(' ')})`

  const suffix = (name: string) => (argName ? (name.startsWith('--') ? '=' : '+') : '')
  const tail = `[${description}]${argName ? `:${message(argName)}:` : ''}`
  if (names.length === 1) {
    return `${quote(exclusive)}${quote(`${names[0]}${suffix(names[0] as string)}${tail}`)}`
  }
  const braces = names.map((n) => `${n}${suffix(n)}`).join(',')
  return `${quote(exclusive)}{${braces}}${quote(tail)}`
}

const helpSpec = () => `'(- *)'{-h,--help}${quote('[display help for command]')}`

function action(hint: ArgHint | undefined, index: number): string {
  if (!hint) return ''
  if (hint.type === 'dirs') return '_files -/'
  if (hint.type === 'values') return `(${hint.values.join(' ')})`
  return `->arg${index + 1}`
}

function leafFunction(command: Command, path: readonly string[], hints: Hints): string {
  const name = functionName(['reclaim-cli', ...path])
  const hintList = hints[path.join(' ')] ?? []
  const specs = [...command.options.map(optionSpec), helpSpec()]
  const states: string[] = []

  command.registeredArguments.forEach((arg, index) => {
    // A variadic argument reuses the last hint for every value.
    const hint = hintList[index] ?? (arg.variadic ? hintList.at(-1) : undefined)
    const act = action(hint, index)
    if (hint?.type === 'by-arg') states.push(`arg${index + 1}`)
    const prefix = arg.variadic ? '*' : arg.required ? '' : ':'
    specs.push(quote(`${prefix}:${message(arg.name())}:${act}`))
  })

  const body = specs.map((s) => `    ${s}`).join(' \\\n')
  if (states.length === 0) return `${name}() {\n  _arguments \\\n${body}\n}\n`

  const cases = hintList
    .map((hint, index) => {
      if (hint.type !== 'by-arg') return ''
      const arms = Object.entries(hint.map)
        .map(([key, values]) => `${key}) _values ${quote('value')} ${values.join(' ')} ;;`)
        .join('\n        ')
      return `    arg${index + 1})
      case $line[${hint.arg}] in
        ${arms}
        *) _message ${quote(message(command.registeredArguments[index]?.name() ?? 'value'))} ;;
      esac ;;`
    })
    .filter(Boolean)
    .join('\n')

  return `${name}() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  _arguments -C \\
${body}
  case $state in
${cases}
  esac
}
`
}

function groupFunction(command: Command, path: readonly string[], hints: Hints): string[] {
  const name = functionName(['reclaim-cli', ...path])
  const subcommands = command.commands
  const entries = subcommands
    .map((sub) => `    ${quote(`${entryName(sub.name())}:${sub.description()}`)}`)
    .join('\n')
  const dispatch = subcommands
    .map((sub) => `        ${sub.name()}) ${functionName(['reclaim-cli', ...path, sub.name()])} ;;`)
    .join('\n')
  const options = command.options.map(optionSpec)
  const specs = [...options, helpSpec(), `'1: :->command'`, `'*:: :->args'`]
    .map((s) => `    ${s}`)
    .join(' \\\n')

  const own = `${name}() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  local -a commands
  commands=(
${entries}
  )
  _arguments -C \\
${specs}
  case $state in
    command) _describe -t commands ${quote(`${command.name()} command`)} commands ;;
    args)
      curcontext="\${curcontext%:*:*}:reclaim-cli-$line[1]:"
      case $line[1] in
${dispatch}
      esac ;;
  esac
}
`
  return [own, ...subcommands.flatMap((sub) => commandFunctions(sub, [...path, sub.name()], hints))]
}

function commandFunctions(command: Command, path: readonly string[], hints: Hints): string[] {
  if (command.commands.length === 0) return [leafFunction(command, path, hints)]
  return groupFunction(command, path, hints)
}

/**
 * zsh completion functions for a Commander program: subcommands (nested too), options with
 * descriptions, and positional hints. Generated from the command tree so it cannot drift.
 */
export function generateZshCompletion(program: Command, hints: Hints): string {
  const root = groupFunction(program, [], hints)
  return root.join('\n')
}

/** Standalone script for `source <(reclaim-cli completion zsh)`; needs compinit to have run. */
export function standaloneZshCompletion(program: Command, hints: Hints): string {
  return `#compdef ${program.name()}
${generateZshCompletion(program, hints)}
(( $+functions[compdef] )) && compdef ${functionName([program.name()])} ${program.name()}
`
}
