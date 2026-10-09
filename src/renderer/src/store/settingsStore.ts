import { create } from 'zustand'

// App-wide display preferences (per machine, kept in localStorage).
const SEPARATOR_KEY = 'rdm.keySeparator'
const DEFAULT_SEPARATOR = ':'

function readSeparator(): string {
  try {
    return localStorage.getItem(SEPARATOR_KEY) || DEFAULT_SEPARATOR
  } catch {
    return DEFAULT_SEPARATOR
  }
}

interface SettingsStore {
  keySeparator: string // splits key names into the folder tree
  setKeySeparator: (sep: string) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  keySeparator: readSeparator(),
  setKeySeparator: (sep) => {
    // Empty would put every key at the top level; fall back to the default.
    const next = sep || DEFAULT_SEPARATOR
    try {
      localStorage.setItem(SEPARATOR_KEY, next)
    } catch {
      // ignore — per-viewer convenience only
    }
    set({ keySeparator: next })
  }
}))
