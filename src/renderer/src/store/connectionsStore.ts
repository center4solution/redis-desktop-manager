import { create } from 'zustand'
import type { ConnectionProfile, ConnectionState, ProfileFormValues } from '../types/connection'
import { useKeysStore } from './keysStore'
import { useCliStore } from './cliStore'
import { useViewStore } from './viewStore'
import { useDbAliasStore } from './dbAliasStore'

// A backend connection id is single-use (a reconnect gets a new one), so
// everything the UI kept for the old id would otherwise stay in memory forever.
function releaseBackend(backendId: string | undefined): void {
  if (!backendId) return
  useKeysStore.getState().clearConnection(backendId)
  useCliStore.getState().clearConnection(backendId)
  useViewStore.getState().clearConnection(backendId)
}

// Web Crypto is available in the renderer (browser context) — no Node dep needed.
const randomUUID = (): string => crypto.randomUUID()

interface ConnectionsStore {
  profiles: ConnectionProfile[]
  states: Record<string, ConnectionState> // keyed by profile id
  activeProfileId: string | null
  loaded: boolean

  loadProfiles: () => Promise<void>
  addProfile: (values: ProfileFormValues) => Promise<ConnectionProfile>
  updateProfile: (id: string, values: ProfileFormValues) => Promise<void>
  removeProfile: (id: string) => Promise<void>
  setActiveProfile: (id: string | null) => void

  connect: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
  selectDb: (id: string, db: number) => Promise<void>
  // Main-process push: a live connection dropped / is retrying / came back.
  applyStatusEvent: (event: {
    id: string
    status: 'connected' | 'connecting' | 'disconnected'
    error?: string
  }) => void
}

export const useConnectionsStore = create<ConnectionsStore>((set, get) => ({
  profiles: [],
  states: {},
  activeProfileId: null,
  loaded: false,

  loadProfiles: async () => {
    const stored = await window.api.config.listProfiles()
    set({ profiles: stored, loaded: true })
  },

  addProfile: async (values) => {
    const id = randomUUID()
    await window.api.config.saveProfile({ ...values, id })
    // Keep the page's copy password-free: only remember whether one is saved.
    const { password, clearPassword: _clear, ...rest } = values
    const newProfile: ConnectionProfile = { ...rest, id, hasPassword: Boolean(password) }
    set((s) => ({ profiles: [...s.profiles, newProfile] }))
    return newProfile
  },

  updateProfile: async (id, values) => {
    await window.api.config.saveProfile({ ...values, id })
    const { password, clearPassword, ...rest } = values
    set((s) => ({
      profiles: s.profiles.map((p) =>
        p.id === id
          ? {
              ...rest,
              id,
              hasPassword: clearPassword ? false : password ? true : p.hasPassword
            }
          : p
      )
    }))
  },

  removeProfile: async (id) => {
    const state = get().states[id]
    if (state?.backendId) {
      window.api.redis.disconnect(state.backendId).catch(() => {})
      releaseBackend(state.backendId)
    }
    await window.api.config.deleteProfile(id)
    useDbAliasStore.getState().clearProfile(id)
    set((s) => {
      const { [id]: _removed, ...rest } = s.states
      return {
        profiles: s.profiles.filter((p) => p.id !== id),
        states: rest,
        activeProfileId: s.activeProfileId === id ? null : s.activeProfileId
      }
    })
  },

  setActiveProfile: (id) => set({ activeProfileId: id }),

  connect: async (id) => {
    const profile = get().profiles.find((p) => p.id === id)
    if (!profile) return

    // Reconnecting after a drop: release the dead backend connection first.
    const previous = get().states[id]?.backendId
    if (previous) {
      window.api.redis.disconnect(previous).catch(() => {})
      releaseBackend(previous)
    }

    set((s) => ({ states: { ...s.states, [id]: { status: 'connecting' } } }))

    try {
      // The saved password is read in the main process; it never reaches the page.
      const info = await window.api.redis.connectProfile(id)
      set((s) => ({
        states: {
          ...s.states,
          [id]: { status: 'connected', backendId: info.id, currentDb: profile.db ?? 0 }
        },
        activeProfileId: id
      }))
    } catch (err) {
      set((s) => ({
        states: {
          ...s.states,
          [id]: { status: 'error', error: err instanceof Error ? err.message : String(err) }
        }
      }))
    }
  },

  disconnect: async (id) => {
    const state = get().states[id]
    if (!state?.backendId) return
    await window.api.redis.disconnect(state.backendId)
    releaseBackend(state.backendId)
    set((s) => ({
      states: { ...s.states, [id]: { status: 'disconnected' } }
    }))
  },

  selectDb: async (id, db) => {
    const state = get().states[id]
    if (!state?.backendId || state.currentDb === db) return
    await window.api.server.selectDb(state.backendId, db)
    set((s) => ({
      states: { ...s.states, [id]: { ...s.states[id], currentDb: db } }
    }))
  },

  applyStatusEvent: (event) => {
    set((s) => {
      const entry = Object.entries(s.states).find(([, st]) => st.backendId === event.id)
      if (!entry) return s
      const [profileId, st] = entry
      if (event.status === 'disconnected') {
        // Keep backendId so a later 'connected' (if retries succeed) can restore it;
        // the sidebar treats anything but 'connected' as not usable.
        return {
          states: {
            ...s.states,
            [profileId]: { ...st, status: 'error', error: event.error ?? 'Connection lost' }
          }
        }
      }
      return {
        states: {
          ...s.states,
          [profileId]: { ...st, status: event.status, error: undefined }
        }
      }
    })
  }
}))
