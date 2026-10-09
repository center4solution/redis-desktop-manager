import { ipcMain } from 'electron'
import { connectionManager } from '../connectionManager'

// Minimal shell-like tokenizer: splits on whitespace, respects single/double
// quotes so values like SET key "hello world" work as expected.
export function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current) tokens.push(current)
  return tokens
}

function formatReply(reply: unknown): string {
  if (reply === null || reply === undefined) return '(nil)'
  if (Buffer.isBuffer(reply)) return reply.toString('utf-8')
  if (Array.isArray(reply)) {
    if (reply.length === 0) return '(empty array)'
    return reply.map((item, i) => `${i + 1}) ${formatReply(item)}`).join('\n')
  }
  if (typeof reply === 'number') return String(reply)
  return String(reply)
}

// Commands that switch a connection into a streaming/replication mode and
// never return a normal reply — they would wedge the console.
const UNSUPPORTED = new Set(['SUBSCRIBE', 'PSUBSCRIBE', 'SSUBSCRIBE', 'MONITOR', 'SYNC', 'PSYNC'])

export function registerCliHandlers(): void {
  ipcMain.handle(
    'cli:exec',
    async (_evt, connId: string, commandLine: string): Promise<string> => {
      const tokens = tokenize(commandLine)
      if (tokens.length === 0) return ''

      const [cmd, ...args] = tokens
      if (UNSUPPORTED.has(cmd.toUpperCase())) {
        throw new Error(`${cmd.toUpperCase()} is not supported in this console`)
      }
      const client = await connectionManager.getCliClient(connId)

      // client.call accepts arbitrary command names, so any Redis command
      // (including ones ioredis has no typed helper for) works here.
      const reply = await client.call(cmd, ...args)
      return formatReply(reply)
    }
  )
}
