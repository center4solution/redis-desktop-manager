import { contextBridge, ipcRenderer, webFrame } from 'electron'

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

export interface ScanResult {
  cursor: string
  keys: string[]
}

export type KeyValue =
  | { type: 'string'; value: string }
  | { type: 'hash'; value: Record<string, string>; truncated: boolean }
  | { type: 'list'; value: string[]; truncated: boolean }
  | { type: 'set'; value: string[]; truncated: boolean }
  | { type: 'zset'; value: { member: string; score: number }[]; truncated: boolean }
  | { type: 'stream'; value: { id: string; fields: Record<string, string> }[]; truncated: boolean }
  | { type: 'none'; value: null }
  | { type: 'unknown'; value: null }

export interface KeyDetail {
  key: string
  ttl: number
  data: KeyValue
}

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

export interface ConnectionStatusEvent {
  id: string
  status: 'connected' | 'connecting' | 'disconnected'
  error?: string
}

// Profiles as the page sees them: no password, only whether one is saved.
export interface StoredConnectionProfile {
  id: string
  name: string
  host: string
  port: number
  username?: string
  db?: number
  tls?: boolean
  icon?: string
  hasPassword: boolean
}

// What the page sends to save: `password` sets a new one, omitting it keeps the
// saved one, `clearPassword` removes it.
export interface SaveConnectionProfile {
  id: string
  name: string
  host: string
  port: number
  username?: string
  db?: number
  tls?: boolean
  icon?: string
  password?: string
  clearPassword?: boolean
}

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'downloading'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

// Typed, minimal API surface exposed to the renderer.
// Nothing raw (no ipcRenderer, no Node APIs) is exposed — only named methods.
const api = {
  zoom: {
    set: (factor: number): void => webFrame.setZoomFactor(factor)
  },
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),

  redis: {
    connect: (name: string, config: ConnectionConfig): Promise<ConnectionInfo> =>
      ipcRenderer.invoke('redis:connect', name, config),
    disconnect: (id: string): Promise<void> => ipcRenderer.invoke('redis:disconnect', id),
    list: (): Promise<ConnectionInfo[]> => ipcRenderer.invoke('redis:list'),
    ping: (id: string): Promise<string> => ipcRenderer.invoke('redis:ping', id),
    connectProfile: (id: string): Promise<ConnectionInfo> =>
      ipcRenderer.invoke('redis:connectProfile', id),
    test: (config: ConnectionConfig, profileId?: string): Promise<void> =>
      ipcRenderer.invoke('redis:test', config, profileId),
    onStatus: (callback: (event: ConnectionStatusEvent) => void): (() => void) => {
      const listener = (_evt: unknown, payload: ConnectionStatusEvent): void => callback(payload)
      ipcRenderer.on('redis:statusEvent', listener)
      return () => ipcRenderer.removeListener('redis:statusEvent', listener)
    }
  },

  config: {
    listProfiles: (): Promise<StoredConnectionProfile[]> =>
      ipcRenderer.invoke('config:listProfiles'),
    saveProfile: (profile: SaveConnectionProfile): Promise<void> =>
      ipcRenderer.invoke('config:saveProfile', profile),
    storageSecurity: (): Promise<{ secure: boolean; reason?: string }> =>
      ipcRenderer.invoke('config:storageSecurity'),
    deleteProfile: (id: string): Promise<void> => ipcRenderer.invoke('config:deleteProfile', id)
  },

  keys: {
    scan: (connId: string, cursor: string, pattern: string): Promise<ScanResult> =>
      ipcRenderer.invoke('keys:scan', connId, cursor, pattern),
    types: (connId: string, keys: string[]): Promise<Record<string, string>> =>
      ipcRenderer.invoke('keys:types', connId, keys),
    ttl: (connId: string, key: string): Promise<number> =>
      ipcRenderer.invoke('keys:ttl', connId, key),
    delete: (connId: string, key: string): Promise<void> =>
      ipcRenderer.invoke('keys:delete', connId, key),
    deleteMany: (connId: string, keys: string[]): Promise<number> =>
      ipcRenderer.invoke('keys:deleteMany', connId, keys),
    getValue: (connId: string, key: string): Promise<KeyDetail> =>
      ipcRenderer.invoke('keys:getValue', connId, key)
  },

  value: {
    setString: (connId: string, key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('value:setString', connId, key, value),
    createString: (connId: string, key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('value:createString', connId, key, value),
    hashSet: (connId: string, key: string, field: string, value: string): Promise<void> =>
      ipcRenderer.invoke('value:hashSet', connId, key, field, value),
    hashDelete: (connId: string, key: string, field: string): Promise<void> =>
      ipcRenderer.invoke('value:hashDelete', connId, key, field),
    listSet: (connId: string, key: string, index: number, value: string): Promise<void> =>
      ipcRenderer.invoke('value:listSet', connId, key, index, value),
    listPush: (
      connId: string,
      key: string,
      value: string,
      side: 'head' | 'tail'
    ): Promise<void> => ipcRenderer.invoke('value:listPush', connId, key, value, side),
    listRemoveAt: (connId: string, key: string, index: number): Promise<void> =>
      ipcRenderer.invoke('value:listRemoveAt', connId, key, index),
    setAdd: (connId: string, key: string, member: string): Promise<void> =>
      ipcRenderer.invoke('value:setAdd', connId, key, member),
    setRemove: (connId: string, key: string, member: string): Promise<void> =>
      ipcRenderer.invoke('value:setRemove', connId, key, member),
    zsetAdd: (connId: string, key: string, member: string, score: number): Promise<void> =>
      ipcRenderer.invoke('value:zsetAdd', connId, key, member, score),
    zsetRemove: (connId: string, key: string, member: string): Promise<void> =>
      ipcRenderer.invoke('value:zsetRemove', connId, key, member),
    rename: (connId: string, oldKey: string, newKey: string): Promise<void> =>
      ipcRenderer.invoke('value:rename', connId, oldKey, newKey),
    expire: (connId: string, key: string, seconds: number): Promise<void> =>
      ipcRenderer.invoke('value:expire', connId, key, seconds),
    persist: (connId: string, key: string): Promise<void> =>
      ipcRenderer.invoke('value:persist', connId, key),
    duplicate: (connId: string, key: string, newKey: string): Promise<void> =>
      ipcRenderer.invoke('value:duplicate', connId, key, newKey)
  },

  cli: {
    exec: (connId: string, commandLine: string): Promise<string> =>
      ipcRenderer.invoke('cli:exec', connId, commandLine)
  },

  server: {
    selectDb: (connId: string, db: number): Promise<void> =>
      ipcRenderer.invoke('server:selectDb', connId, db),
    flushDb: (connId: string, db: number): Promise<void> =>
      ipcRenderer.invoke('server:flushDb', connId, db),
    info: (connId: string): Promise<ServerInfo> => ipcRenderer.invoke('server:info', connId)
  },

  updates: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
    download: (): Promise<void> => ipcRenderer.invoke('app:downloadUpdate'),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke('app:quitAndInstall'),
    onEvent: (callback: (event: UpdateEvent) => void): (() => void) => {
      const listener = (_evt: unknown, payload: UpdateEvent): void => callback(payload)
      ipcRenderer.on('app:updateEvent', listener)
      return () => ipcRenderer.removeListener('app:updateEvent', listener)
    }
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
