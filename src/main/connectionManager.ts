import Redis, { RedisOptions } from 'ioredis'
import { randomUUID } from 'node:crypto'

export interface ConnectionConfig {
  host: string
  port: number
  password?: string
  username?: string
  db?: number
  tls?: boolean
}

export interface ConnectionInfo {
  id: string
  name: string
  status: 'connected' | 'disconnected' | 'error'
  error?: string
}

// Pushed to the renderer when an established connection changes state
// (dropped, reconnecting, back up), so the UI never shows a stale "connected".
export interface StatusEvent {
  id: string
  status: 'connected' | 'connecting' | 'disconnected'
  error?: string
}

interface ConnectionEntry {
  id: string
  name: string
  // Keys whose raw bytes aren't valid UTF-8 can't round-trip through a JS
  // string, so the renderer sees an escaped display name and we remember the
  // real bytes here to use when that name comes back in a command.
  binaryKeys: Map<string, Buffer>
  // Separate connection for the CLI tab, created on first use, so blocking or
  // mode-switching commands (BLPOP, SELECT, …) can't disturb the key browser.
  cli?: { client: Redis; syncedDb: number }
  client: Redis
  status: ConnectionInfo['status']
  error?: string
}

/**
 * Owns all live Redis connections in the main process.
 * Renderer never touches sockets directly — only via IPC handlers
 * that call into this manager.
 */
export class ConnectionManager {
  private connections = new Map<string, ConnectionEntry>()
  private statusListener: ((event: StatusEvent) => void) | null = null

  onStatus(listener: (event: StatusEvent) => void): void {
    this.statusListener = listener
  }

  async connect(name: string, config: ConnectionConfig): Promise<ConnectionInfo> {
    const id = randomUUID()
    // Until the first successful connect we fail fast so a bad config reports
    // quickly; once up, a dropped link is retried with backoff.
    let established = false

    const options: RedisOptions = {
      host: config.host,
      port: config.port,
      password: config.password || undefined,
      username: config.username || undefined,
      db: config.db ?? 0,
      tls: config.tls ? {} : undefined,
      // Don't let ioredis retry forever in the background on a bad config —
      // fail fast so the UI can report a clear error.
      retryStrategy: (times) =>
        established
          ? times > 10
            ? null
            : Math.min(times * 500, 5000)
          : times > 2
            ? null
            : Math.min(times * 200, 1000),
      maxRetriesPerRequest: 2,
      lazyConnect: true
    }

    const client = new Redis(options)
    const entry: ConnectionEntry = {
      id,
      name,
      client,
      status: 'disconnected',
      binaryKeys: new Map()
    }
    this.connections.set(id, entry)

    client.on('error', (err) => {
      entry.status = 'error'
      entry.error = err.message
    })
    client.on('ready', () => {
      entry.status = 'connected'
      entry.error = undefined
      if (established) this.emitStatus({ id, status: 'connected' })
    })
    client.on('reconnecting', () => {
      if (established && this.connections.has(id)) this.emitStatus({ id, status: 'connecting' })
    })
    client.on('end', () => {
      entry.status = 'disconnected'
      // Only report drops we didn't cause (disconnect() removes the entry first).
      if (established && this.connections.has(id)) {
        this.emitStatus({ id, status: 'disconnected', error: entry.error })
      }
    })

    try {
      await client.connect()
      await client.ping()
      entry.status = 'connected'
      established = true
    } catch (err) {
      const generic = err instanceof Error ? err.message : String(err)
      // On a rejected login ioredis rejects connect() with a bare "Connection is
      // closed." and reports the real reason (WRONGPASS, NOAUTH, …) only through
      // the 'error' event, which the handler above already recorded.
      const reason = entry.error && /connection is closed/i.test(generic) ? entry.error : generic
      entry.status = 'error'
      entry.error = reason
      // Don't leak the half-open client or its map entry on a failed attempt.
      this.connections.delete(id)
      client.disconnect()
      throw new Error(entry.error)
    }

    return this.toInfo(entry)
  }

  /** One-off connect + PING with a short timeout; nothing is kept open. */
  async test(config: ConnectionConfig): Promise<void> {
    const client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password || undefined,
      username: config.username || undefined,
      db: config.db ?? 0,
      tls: config.tls ? {} : undefined,
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy: () => null,
      maxRetriesPerRequest: 0
    })
    let lastError: string | undefined
    client.on('error', (err) => {
      lastError = err.message
    })
    try {
      await client.connect()
      await client.ping()
    } catch (err) {
      const generic = err instanceof Error ? err.message : String(err)
      throw new Error(lastError && /connection is closed/i.test(generic) ? lastError : generic)
    } finally {
      client.disconnect()
    }
  }

  async disconnect(id: string): Promise<void> {
    const entry = this.connections.get(id)
    if (!entry) return
    entry.client.disconnect()
    entry.cli?.client.disconnect()
    this.connections.delete(id)
  }

  /**
   * Dedicated connection for the CLI console. It follows the database chosen
   * in the sidebar (re-selected whenever that changes) but is otherwise
   * independent: a SELECT typed in the console never moves the key browser.
   */
  async getCliClient(id: string): Promise<Redis> {
    const entry = this.connections.get(id)
    if (!entry) throw new Error(`No active connection with id ${id}`)
    const mainDb = entry.client.options.db ?? 0
    if (!entry.cli) {
      const client = entry.client.duplicate({
        db: mainDb,
        // A console command that blocks forever (BLPOP …) fails instead of hanging.
        commandTimeout: 30000
      })
      client.on('error', () => {})
      entry.cli = { client, syncedDb: mainDb }
    } else if (entry.cli.syncedDb !== mainDb) {
      await entry.cli.client.select(mainDb)
      entry.cli.syncedDb = mainDb
    }
    return entry.cli.client
  }

  list(): ConnectionInfo[] {
    return [...this.connections.values()].map((e) => this.toInfo(e))
  }

  getClient(id: string): Redis {
    const entry = this.connections.get(id)
    if (!entry) throw new Error(`No active connection with id ${id}`)
    return entry.client
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((id) => this.disconnect(id)))
  }

  /** Display name for raw key bytes; registers the bytes if they aren't valid UTF-8. */
  displayKey(id: string, raw: Buffer): string {
    const text = raw.toString('utf8')
    if (Buffer.from(text, 'utf8').equals(raw)) return text
    const escaped = [...raw]
      .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, '0')}`))
      .join('')
    // U+FFFD prefix keeps these names from colliding with ordinary keys.
    const display = `\uFFFD${escaped}`
    this.connections.get(id)?.binaryKeys.set(display, raw)
    return display
  }

  /** The key to send to Redis: the original bytes for a registered binary key. */
  resolveKey(id: string, key: string): string | Buffer {
    return this.connections.get(id)?.binaryKeys.get(key) ?? key
  }

  private emitStatus(event: StatusEvent): void {
    this.statusListener?.(event)
  }

  private toInfo(entry: ConnectionEntry): ConnectionInfo {
    return { id: entry.id, name: entry.name, status: entry.status, error: entry.error }
  }
}

export const connectionManager = new ConnectionManager()
