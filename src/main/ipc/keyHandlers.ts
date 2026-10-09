import { ipcMain } from 'electron'
import { connectionManager } from '../connectionManager'

export interface ScanResult {
  cursor: string
  keys: string[]
}

const SCAN_COUNT = 1000

export function registerKeyHandlers(): void {
  // Never uses KEYS * — always cursor-based SCAN so large DBs don't block Redis
  // or the UI. Renderer drives pagination by repeatedly calling this with the
  // returned cursor until it comes back as '0'.
  ipcMain.handle(
    'keys:scan',
    async (_evt, connId: string, cursor: string, pattern: string): Promise<ScanResult> => {
      const client = connectionManager.getClient(connId)
      // scanBuffer so key names that aren't valid UTF-8 survive intact.
      const [nextCursor, raw] = await client.scanBuffer(
        cursor,
        'MATCH',
        pattern || '*',
        'COUNT',
        SCAN_COUNT
      )
      return {
        cursor: String(nextCursor),
        keys: raw.map((k) => connectionManager.displayKey(connId, k))
      }
    }
  )

  // Batched TYPE lookup via pipeline — one round trip for many keys instead of
  // one command per key.
  ipcMain.handle(
    'keys:types',
    async (_evt, connId: string, keys: string[]): Promise<Record<string, string>> => {
      if (keys.length === 0) return {}
      const client = connectionManager.getClient(connId)
      const pipeline = client.pipeline()
      keys.forEach((k) => pipeline.type(connectionManager.resolveKey(connId, k)))
      const results = await pipeline.exec()
      const out: Record<string, string> = {}
      results?.forEach((res, i) => {
        const [err, type] = res
        out[keys[i]] = err ? 'unknown' : (type as string)
      })
      return out
    }
  )

  ipcMain.handle('keys:ttl', async (_evt, connId: string, key: string): Promise<number> => {
    const client = connectionManager.getClient(connId)
    return client.ttl(connectionManager.resolveKey(connId, key))
  })

  ipcMain.handle('keys:delete', async (_evt, connId: string, key: string): Promise<void> => {
    const client = connectionManager.getClient(connId)
    await client.del(connectionManager.resolveKey(connId, key))
  })

  // Bulk delete via UNLINK (non-blocking free) in chunks, so deleting a big
  // folder doesn't stall Redis or build one enormous command.
  ipcMain.handle(
    'keys:deleteMany',
    async (_evt, connId: string, keys: string[]): Promise<number> => {
      const client = connectionManager.getClient(connId)
      let removed = 0
      for (let i = 0; i < keys.length; i += 500) {
        removed += await client.unlink(
          ...keys.slice(i, i + 500).map((k) => connectionManager.resolveKey(connId, k))
        )
      }
      return removed
    }
  )
}
