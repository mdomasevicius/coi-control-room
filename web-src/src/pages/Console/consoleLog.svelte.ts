import { api } from '@/logic/api/client'
import type { CommandResult } from '@/logic/api/types'

export interface LogEntry {
  id: number
  /** Game date when sent. */
  at: string
  /** What was sent: a console line, or an input command type with its JSON args. */
  label: string
  kind: 'console' | 'input'
  ok: boolean | null
  /** Error, or the command's result when there is one worth showing. */
  detail: string
}

let nextId = 1

/**
 * The console transcript, shared by the terminal and the input-command form, kept for the browser session (across
 * page navigation). Newest last, like a shell.
 */
class ConsoleLog {
  entries = $state<LogEntry[]>([])
  busy = $state(false)

  async run(kind: LogEntry['kind'], label: string, at: string, send: () => Promise<CommandResult>) {
    const entry: LogEntry = { id: nextId++, at, label, kind, ok: null, detail: '' }
    this.entries.push(entry)
    if (this.entries.length > 200) this.entries.splice(0, this.entries.length - 200)
    const live = this.entries[this.entries.length - 1]
    this.busy = true
    try {
      const res = await send()
      live.ok = res.ok && res.result !== false
      live.detail = res.error || (res.result !== null && res.result !== true && res.result !== false ? JSON.stringify(res.result) : '')
    } catch (e) {
      live.ok = false
      live.detail = e instanceof Error ? e.message : String(e)
    } finally {
      this.busy = false
    }
  }

  console(line: string, at: string) {
    return this.run('console', line, at, () => api.console(line))
  }

  input(type: string, args: Record<string, unknown>, at: string) {
    return this.run('input', `${type} ${JSON.stringify(args)}`, at, () => api.command(type, args))
  }

  clear() {
    this.entries = []
  }
}

export const consoleLog = new ConsoleLog()
