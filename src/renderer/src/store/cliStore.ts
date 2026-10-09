import { create } from 'zustand'

export interface CliEntry {
  command: string
  result?: string
  error?: string
}

interface ConnectionCliState {
  entries: CliEntry[]
  history: string[]
}

function fresh(): ConnectionCliState {
  return { entries: [], history: [] }
}

// Stable shared default so getState() returns the same reference every call
// for a connId with no entry yet — a fresh object per call would look like a
// state change to Zustand subscribers and cause an infinite render loop.
const DEFAULT_STATE = fresh()

interface CliStore {
  byConnection: Record<string, ConnectionCliState>
  getState: (connId: string) => ConnectionCliState
  run: (connId: string, commandLine: string) => Promise<void>
  clear: (connId: string) => void
  // Forget a backend connection entirely (history included).
  clearConnection: (connId: string) => void
}

export const useCliStore = create<CliStore>((set, get) => ({
  byConnection: {},

  getState: (connId) => get().byConnection[connId] ?? DEFAULT_STATE,

  run: async (connId, commandLine) => {
    const trimmed = commandLine.trim()
    if (!trimmed) return

    const state = get().byConnection[connId] ?? fresh()
    const history = [...state.history, trimmed]

    try {
      const result = await window.api.cli.exec(connId, trimmed)
      set((s) => ({
        byConnection: {
          ...s.byConnection,
          [connId]: {
            entries: [...(s.byConnection[connId]?.entries ?? state.entries), { command: trimmed, result }],
            history
          }
        }
      }))
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      set((s) => ({
        byConnection: {
          ...s.byConnection,
          [connId]: {
            entries: [...(s.byConnection[connId]?.entries ?? state.entries), { command: trimmed, error }],
            history
          }
        }
      }))
    }
  },

  clear: (connId) => {
    set((s) => ({
      byConnection: { ...s.byConnection, [connId]: { ...fresh(), history: s.byConnection[connId]?.history ?? [] } }
    }))
  },

  clearConnection: (connId) => {
    set((s) => {
      const { [connId]: _dropped, ...byConnection } = s.byConnection
      return { byConnection }
    })
  }
}))
