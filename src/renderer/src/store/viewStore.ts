import { create } from 'zustand'

// Which tab is showing in the main panel for a given connection: the server
// status page, the CLI console, or the currently selected key.
export type MainView = 'status' | 'cli' | 'key'

interface ViewStore {
  views: Record<string, MainView> // connId -> active view
  setView: (connId: string, view: MainView) => void
  clearConnection: (connId: string) => void
}

export const useViewStore = create<ViewStore>((set) => ({
  views: {},
  setView: (connId, view) => set((s) => ({ views: { ...s.views, [connId]: view } })),
  clearConnection: (connId) =>
    set((s) => {
      const { [connId]: _dropped, ...views } = s.views
      return { views }
    })
}))
