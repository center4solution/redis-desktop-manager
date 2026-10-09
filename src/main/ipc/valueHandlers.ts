import { ipcMain } from 'electron'
import { connectionManager } from '../connectionManager'

const COLLECTION_LIMIT = 500 // read-only viewer caps large collections; full paging is a later step

export type KeyValue =
  // binary: true => value is a read-only hex dump (bytes aren't valid UTF-8 text)
  | { type: 'string'; value: string; binary: boolean; size: number }
  | { type: 'hash'; value: Record<string, string>; truncated: boolean }
  | { type: 'list'; value: string[]; truncated: boolean }
  | { type: 'set'; value: string[]; truncated: boolean }
  | { type: 'zset'; value: { member: string; score: number }[]; truncated: boolean }
  | { type: 'stream'; value: { id: string; fields: Record<string, string> }[]; truncated: boolean }
  | { type: 'none'; value: null }
  | { type: 'unknown'; value: null }

export interface KeyDetail {
  key: string
  ttl: number // -1 no expiry, -2 key missing
  data: KeyValue
}

// 16 bytes per line: offset, hex, printable ASCII. Capped so a huge blob can't
// flood the UI.
const HEX_DUMP_LIMIT = 4096
function hexDump(buf: Buffer): string {
  const lines: string[] = []
  const shown = buf.subarray(0, HEX_DUMP_LIMIT)
  for (let i = 0; i < shown.length; i += 16) {
    const chunk = shown.subarray(i, i + 16)
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ')
    const ascii = [...chunk].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('')
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`)
  }
  if (buf.length > HEX_DUMP_LIMIT) lines.push(`… ${buf.length - HEX_DUMP_LIMIT} more bytes not shown`)
  return lines.join('\n')
}

export function registerValueHandlers(): void {
  ipcMain.handle('keys:getValue', async (_evt, connId: string, key: string): Promise<KeyDetail> => {
    const client = connectionManager.getClient(connId)
    const rk = connectionManager.resolveKey(connId, key)

    const [type, ttl] = await Promise.all([client.type(rk), client.ttl(rk)])

    if (type === 'none') {
      return { key, ttl, data: { type: 'none', value: null } }
    }

    let data: KeyValue

    switch (type) {
      case 'string': {
        const raw = (await client.getBuffer(rk)) ?? Buffer.alloc(0)
        const text = raw.toString('utf8')
        if (Buffer.from(text, 'utf8').equals(raw)) {
          data = { type: 'string', value: text, binary: false, size: raw.length }
        } else {
          data = { type: 'string', value: hexDump(raw), binary: true, size: raw.length }
        }
        break
      }
      case 'hash': {
        // HSCAN a page at a time and stop at the limit — never HGETALL a huge hash.
        const value: Record<string, string> = {}
        let cursor = '0'
        do {
          const [next, flat] = await client.hscan(rk, cursor, 'COUNT', COLLECTION_LIMIT)
          cursor = next
          for (let i = 0; i < flat.length; i += 2) value[flat[i]] = flat[i + 1]
        } while (cursor !== '0' && Object.keys(value).length < COLLECTION_LIMIT)
        const fields = Object.entries(value)
        const truncated = cursor !== '0' || fields.length > COLLECTION_LIMIT
        data = {
          type: 'hash',
          value: Object.fromEntries(fields.slice(0, COLLECTION_LIMIT)),
          truncated
        }
        break
      }
      case 'list': {
        const len = await client.llen(rk)
        const items = await client.lrange(rk, 0, COLLECTION_LIMIT - 1)
        data = { type: 'list', value: items, truncated: len > COLLECTION_LIMIT }
        break
      }
      case 'set': {
        // SSCAN a page at a time and stop at the limit — never SMEMBERS a huge set.
        const members = new Set<string>()
        let cursor = '0'
        do {
          const [next, page] = await client.sscan(rk, cursor, 'COUNT', COLLECTION_LIMIT)
          cursor = next
          page.forEach((m) => members.add(m))
        } while (cursor !== '0' && members.size < COLLECTION_LIMIT)
        const truncated = cursor !== '0' || members.size > COLLECTION_LIMIT
        data = { type: 'set', value: [...members].slice(0, COLLECTION_LIMIT), truncated }
        break
      }
      case 'zset': {
        const len = await client.zcard(rk)
        const raw = await client.zrange(rk, '0', String(COLLECTION_LIMIT - 1), 'WITHSCORES')
        const value: { member: string; score: number }[] = []
        for (let i = 0; i < raw.length; i += 2) {
          value.push({ member: raw[i], score: Number(raw[i + 1]) })
        }
        data = { type: 'zset', value, truncated: len > COLLECTION_LIMIT }
        break
      }
      case 'stream': {
        const entries = await client.xrange(rk, '-', '+', 'COUNT', COLLECTION_LIMIT)
        const len = await client.xlen(rk)
        const value = entries.map(([id, fieldsArr]) => {
          const fields: Record<string, string> = {}
          for (let i = 0; i < fieldsArr.length; i += 2) {
            fields[fieldsArr[i]] = fieldsArr[i + 1]
          }
          return { id, fields }
        })
        data = { type: 'stream', value, truncated: len > COLLECTION_LIMIT }
        break
      }
      default:
        data = { type: 'unknown', value: null }
    }

    return { key, ttl, data }
  })
}
