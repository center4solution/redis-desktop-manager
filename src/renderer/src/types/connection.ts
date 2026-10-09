// A saved connection profile (what the user configures, persisted in Step 5).
export interface ConnectionProfile {
  id: string
  name: string
  host: string
  port: number
  username?: string
  db?: number
  tls?: boolean
  icon?: string // small data-URL image shown next to the connection
  // The password itself never reaches the page, only whether one is saved.
  hasPassword?: boolean
}

// What the connection form submits.
export interface ProfileFormValues extends Omit<ConnectionProfile, 'id' | 'hasPassword'> {
  password?: string // new password; omit to keep the saved one
  clearPassword?: boolean // remove the saved password
}

// Live status of a profile that has been connected at least once this session,
// mirrors main-process ConnectionInfo but keyed by profile id, not the
// ephemeral connection id ioredis session gets on the backend.
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface ConnectionState {
  status: ConnectionStatus
  backendId?: string
  error?: string
  currentDb?: number
}
