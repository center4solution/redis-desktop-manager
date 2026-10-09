import { create } from 'zustand'

export type Theme = 'dark' | 'light'

function readStored(): Theme {
  try {
    const stored = localStorage.getItem('rdm-theme')
    return stored === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

interface ThemeStore {
  theme: Theme
  toggle: () => void
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: readStored(),
  toggle: () => {
    const next: Theme = get().theme === 'light' ? 'dark' : 'light'
    try {
      localStorage.setItem('rdm-theme', next)
    } catch {
      // ignore — per-viewer convenience only
    }
    set({ theme: next })
  }
}))
