import { ipcMain } from 'electron'
import { connectionManager } from '../connectionManager'

export interface KeyspaceRow {
  db: number
  keys: number
  expires: number
  avgTtl: number
}

export interface ServerInfo {
  server: {
    version?: string
    os?: string
    processId?: string
    port?: string
  }
  memory: {
    usedHuman?: string
    peakHuman?: string
    luaHuman?: string
  }
  stats: {
    connectedClients?: string
    totalConnectionsReceived?: string
    totalCommandsProcessed?: string
  }
  keyspace: KeyspaceRow[]
}

function parseInfoField(info: string, field: string): string | undefined {
  const match = info.match(new RegExp(`^${field}:(.+)$`, 'm'))
  return match?.[1]?.trim()
}

export function registerServerHandlers(): void {
  ipcMain.handle('server:selectDb', async (_evt, connId: string, db: number): Promise<void> => {
    const client = connectionManager.getClient(connId)
    await client.select(db)
    // ioredis re-selects `options.db` after a reconnect; keep it in step so a
    // reconnect never silently drops us back onto a different database.
    client.options.db = db
  })

  // Clear one database. SELECT + FLUSHDB run inside one MULTI so nothing else on
  // this shared connection can interleave and make FLUSHDB hit the wrong db.
  ipcMain.handle('server:flushDb', async (_evt, connId: string, db: number): Promise<void> => {
    const client = connectionManager.getClient(connId)
    const results = await client.multi().select(db).flushdb().exec()
    const failed = results?.find(([err]) => err)
    if (failed?.[0]) throw failed[0]
    client.options.db = db
  })

  // Full server info dashboard — Server/Memory/Stats fields plus a per-DB
  // key statistics table (keys/expires/avg TTL), matching the classic Redis
  // GUI "info" view (e.g. Another Redis Desktop Manager).
  //
  // Uses `INFO keyspace`, which only lists non-empty DBs — cheap (one
  // command) vs. sweeping SELECT across every DB index. DBs not reported
  // there are filled in as zero, up to the count from CONFIG GET databases.
  ipcMain.handle('server:info', async (_evt, connId: string): Promise<ServerInfo> => {
    const client = connectionManager.getClient(connId)
    const info = await client.info()

    let dbCount = 16
    try {
      const [, value] = await client.config('GET', 'databases')
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed > 0) dbCount = parsed
    } catch {
      // CONFIG may be disabled (e.g. managed Redis) — fall back to the
      // standard default of 16 logical databases.
    }

    const keyspace: KeyspaceRow[] = Array.from({ length: dbCount }, (_, db) => ({
      db,
      keys: 0,
      expires: 0,
      avgTtl: 0
    }))

    const keyspaceLineRe = /^db(\d+):keys=(\d+),expires=(\d+),avg_ttl=(\d+)/gm
    let match: RegExpExecArray | null
    while ((match = keyspaceLineRe.exec(info))) {
      const db = Number(match[1])
      if (db < keyspace.length) {
        keyspace[db] = {
          db,
          keys: Number(match[2]),
          expires: Number(match[3]),
          avgTtl: Number(match[4])
        }
      }
    }

    return {
      server: {
        version: parseInfoField(info, 'redis_version'),
        os: parseInfoField(info, 'os'),
        processId: parseInfoField(info, 'process_id'),
        port: parseInfoField(info, 'tcp_port')
      },
      memory: {
        usedHuman: parseInfoField(info, 'used_memory_human'),
        peakHuman: parseInfoField(info, 'used_memory_peak_human'),
        luaHuman: parseInfoField(info, 'used_memory_lua_human')
      },
      stats: {
        connectedClients: parseInfoField(info, 'connected_clients'),
        totalConnectionsReceived: parseInfoField(info, 'total_connections_received'),
        totalCommandsProcessed: parseInfoField(info, 'total_commands_processed')
      },
      keyspace
    }
  })
}
