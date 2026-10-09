import { ipcMain } from 'electron'
import { connectionManager } from '../connectionManager'

export function registerValueEditHandlers(): void {
  const client = (connId: string) => connectionManager.getClient(connId)
  // Binary (non-UTF-8) key names come back as an escaped display name; map to real bytes.
  const K = (connId: string, key: string): string | Buffer => connectionManager.resolveKey(connId, key)

  // --- string ---
  ipcMain.handle(
    'value:setString',
    async (_evt, connId: string, key: string, value: string): Promise<void> => {
      // KEEPTTL: saving an edit must not silently make an expiring key permanent.
      await client(connId).set(K(connId, key), value, 'KEEPTTL')
    }
  )

  // Create-only: refuses to overwrite a key that already exists.
  ipcMain.handle(
    'value:createString',
    async (_evt, connId: string, key: string, value: string): Promise<void> => {
      const result = await client(connId).set(K(connId, key), value, 'NX')
      if (result === null) throw new Error(`A key named "${key}" already exists`)
    }
  )

  // --- hash ---
  ipcMain.handle(
    'value:hashSet',
    async (_evt, connId: string, key: string, field: string, value: string): Promise<void> => {
      await client(connId).hset(K(connId, key), field, value)
    }
  )
  ipcMain.handle(
    'value:hashDelete',
    async (_evt, connId: string, key: string, field: string): Promise<void> => {
      await client(connId).hdel(K(connId, key), field)
    }
  )

  // --- list ---
  // Editing an item "by index" isn't natively supported for delete, so we use
  // LSET to a unique sentinel then LREM the sentinel — the standard Redis idiom.
  ipcMain.handle(
    'value:listSet',
    async (_evt, connId: string, key: string, index: number, value: string): Promise<void> => {
      await client(connId).lset(K(connId, key), index, value)
    }
  )
  ipcMain.handle(
    'value:listPush',
    async (
      _evt,
      connId: string,
      key: string,
      value: string,
      side: 'head' | 'tail'
    ): Promise<void> => {
      const c = client(connId)
      if (side === 'head') await c.lpush(K(connId, key), value)
      else await c.rpush(K(connId, key), value)
    }
  )
  ipcMain.handle(
    'value:listRemoveAt',
    async (_evt, connId: string, key: string, index: number): Promise<void> => {
      const c = client(connId)
      const sentinel = `__RDM_DELETE_SENTINEL__${Date.now()}_${Math.random()}`
      await c.lset(K(connId, key), index, sentinel)
      await c.lrem(K(connId, key), 1, sentinel)
    }
  )

  // --- set ---
  ipcMain.handle(
    'value:setAdd',
    async (_evt, connId: string, key: string, member: string): Promise<void> => {
      await client(connId).sadd(K(connId, key), member)
    }
  )
  ipcMain.handle(
    'value:setRemove',
    async (_evt, connId: string, key: string, member: string): Promise<void> => {
      await client(connId).srem(K(connId, key), member)
    }
  )

  // --- zset ---
  ipcMain.handle(
    'value:zsetAdd',
    async (_evt, connId: string, key: string, member: string, score: number): Promise<void> => {
      await client(connId).zadd(K(connId, key), score, member)
    }
  )
  ipcMain.handle(
    'value:zsetRemove',
    async (_evt, connId: string, key: string, member: string): Promise<void> => {
      await client(connId).zrem(K(connId, key), member)
    }
  )

  // --- key-level operations ---
  ipcMain.handle(
    'value:rename',
    async (_evt, connId: string, oldKey: string, newKey: string): Promise<void> => {
      // RENAMENX so an existing key is never silently replaced.
      const moved = await client(connId).renamenx(K(connId, oldKey), newKey)
      if (moved === 0) throw new Error(`A key named "${newKey}" already exists`)
    }
  )
  ipcMain.handle(
    'value:expire',
    async (_evt, connId: string, key: string, seconds: number): Promise<void> => {
      await client(connId).expire(K(connId, key), seconds)
    }
  )
  ipcMain.handle('value:persist', async (_evt, connId: string, key: string): Promise<void> => {
    await client(connId).persist(K(connId, key))
  })
  ipcMain.handle(
    'value:duplicate',
    async (_evt, connId: string, key: string, newKey: string): Promise<void> => {
      // COPY is Redis 6.2+; that's a reasonable minimum-version assumption for 2026.
      const copied = await client(connId).call('COPY', K(connId, key), newKey)
      // COPY returns 0 (not an error) when the destination already exists.
      if (copied === 0) throw new Error(`A key named "${newKey}" already exists`)
    }
  )
}
