import { create } from 'zustand'

// Redis can't rename a database, so "rename" is a local display label per
// connection profile + db index, persisted in localStorage.
const STORAGE_KEY = 'rdm.dbAliases'

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

interface DbAliasStore {
  aliases: Record<string, string> // `${profileId}:${db}` -> label
  setAlias: (profileId: string, db: number, name: string) => void
  // Forget every label for a deleted connection.
  clearProfile: (profileId: string) => void
}

export const useDbAliasStore = create<DbAliasStore>((set, get) => ({
  aliases: read(),
  setAlias: (profileId, db, name) => {
    const next = { ...get().aliases }
    const key = `${profileId}:${db}`
    if (name.trim()) next[key] = name.trim()
    else delete next[key]
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore — per-viewer convenience only
    }
    set({ aliases: next })
  },
  clearProfile: (profileId) => {
    const next = Object.fromEntries(
      Object.entries(get().aliases).filter(([k]) => !k.startsWith(`${profileId}:`))
    )
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore — per-viewer convenience only
    }
    set({ aliases: next })
  }
}))
