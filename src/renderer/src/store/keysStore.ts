import { create } from 'zustand'
import { createRoot, insertKey, collectKeys, type TreeNode } from '../lib/keyTree'
import { useSettingsStore } from './settingsStore'

interface ConnectionKeyState {
  root: TreeNode
  types: Record<string, string>
  cursor: string
  pattern: string
  scanning: boolean
  exhausted: boolean // cursor has looped back to '0'
  keyCount: number
}

function freshState(pattern = '*'): ConnectionKeyState {
  return {
    root: createRoot(),
    types: {},
    cursor: '0',
    pattern,
    scanning: false,
    exhausted: false,
    keyCount: 0
  }
}

// A single stable default instance for connections with no entry yet.
// getState() must return the SAME reference on every call for the same
// missing key — otherwise each render produces a new object, which looks
// like a state change to Zustand's subscribers and causes an infinite
// render loop (React error #185).
const DEFAULT_STATE = freshState()

interface KeysStore {
  byConnection: Record<string, ConnectionKeyState>
  expanded: Record<string, Set<string>> // connId -> expanded folder paths
  selectedKey: Record<string, string | undefined> // connId -> active tab (full key)
  openKeys: Record<string, string[]> // connId -> full keys currently open as tabs

  getState: (connId: string) => ConnectionKeyState
  setPattern: (connId: string, pattern: string) => void
  resetAndScan: (connId: string) => Promise<void>
  scanMore: (connId: string) => Promise<void>
  toggleExpanded: (connId: string, path: string) => void
  selectKey: (connId: string, key: string | undefined) => void
  openKey: (connId: string, key: string) => void
  closeKey: (connId: string, key: string) => void
  removeKey: (connId: string, key: string) => void
  // Drop everything held for a backend connection (tree, tabs, selection).
  clearConnection: (connId: string) => void
}

export const useKeysStore = create<KeysStore>((set, get) => ({
  byConnection: {},
  expanded: {},
  selectedKey: {},
  openKeys: {},

  getState: (connId) => get().byConnection[connId] ?? DEFAULT_STATE,

  setPattern: (connId, pattern) => {
    set((s) => ({
      byConnection: { ...s.byConnection, [connId]: { ...freshState(pattern) } }
    }))
  },

  resetAndScan: async (connId) => {
    const current = get().byConnection[connId] ?? freshState()
    set((s) => ({
      byConnection: { ...s.byConnection, [connId]: { ...freshState(current.pattern) } }
    }))
    // Load every key: keep paging until the cursor wraps to 0. The tree fills
    // in page by page, so keys show up as they arrive.
    const root = get().byConnection[connId]?.root
    await get().scanMore(connId)
    while (true) {
      const latest = get().byConnection[connId]
      // Stop if finished, or if a newer reset/search replaced this scan's tree.
      if (!latest || latest.root !== root || latest.exhausted || latest.scanning) break
      await get().scanMore(connId)
    }
  },

  scanMore: async (connId) => {
    const state = get().byConnection[connId] ?? freshState()
    if (state.scanning || state.exhausted) return

    set((s) => ({
      byConnection: { ...s.byConnection, [connId]: { ...state, scanning: true } }
    }))

    try {
      // SCAN may legitimately return an empty page with a non-zero cursor
      // (COUNT is only a hint), so keep going until we get keys or finish.
      let { cursor, keys } = await window.api.keys.scan(connId, state.cursor, state.pattern)
      for (let i = 0; i < 100 && keys.length === 0 && cursor !== '0'; i++) {
        ;({ cursor, keys } = await window.api.keys.scan(connId, cursor, state.pattern))
      }

      const latest = get().byConnection[connId] ?? state
      // A refresh/search replaced this scan's tree while it was in flight: drop the result.
      if (latest.root !== state.root) return
      const root = latest.root
      // SCAN may return the same key more than once; only count/insert new ones.
      keys = [...new Set(keys)].filter((k) => !Object.hasOwn(latest.types, k))
      const sep = useSettingsStore.getState().keySeparator
      keys.forEach((k) => insertKey(root, k, sep))

      let types = latest.types
      if (keys.length > 0) {
        const fetched = await window.api.keys.types(connId, keys)
        types = { ...latest.types, ...fetched }
      }

      set((s) => ({
        byConnection: {
          ...s.byConnection,
          [connId]: {
            ...latest,
            root,
            types,
            cursor,
            scanning: false,
            exhausted: cursor === '0',
            keyCount: latest.keyCount + keys.length
          }
        }
      }))
    } catch (err) {
      set((s) => ({
        byConnection: {
          ...s.byConnection,
          [connId]: { ...state, scanning: false, exhausted: true }
        }
      }))
      throw err
    }
  },

  toggleExpanded: (connId, path) => {
    set((s) => {
      const current = new Set(s.expanded[connId] ?? [])
      if (current.has(path)) current.delete(path)
      else current.add(path)
      return { expanded: { ...s.expanded, [connId]: current } }
    })
  },

  selectKey: (connId, key) => {
    set((s) => ({ selectedKey: { ...s.selectedKey, [connId]: key } }))
  },

  openKey: (connId, key) => {
    set((s) => {
      const open = s.openKeys[connId] ?? []
      const nextOpen = open.includes(key) ? open : [...open, key]
      return {
        openKeys: { ...s.openKeys, [connId]: nextOpen },
        selectedKey: { ...s.selectedKey, [connId]: key }
      }
    })
  },

  closeKey: (connId, key) => {
    set((s) => {
      const open = s.openKeys[connId] ?? []
      const idx = open.indexOf(key)
      if (idx === -1) return s
      const nextOpen = open.filter((k) => k !== key)
      const wasActive = s.selectedKey[connId] === key
      const nextActive = wasActive
        ? (nextOpen[idx] ?? nextOpen[idx - 1] ?? undefined)
        : s.selectedKey[connId]
      return {
        openKeys: { ...s.openKeys, [connId]: nextOpen },
        selectedKey: { ...s.selectedKey, [connId]: nextActive }
      }
    })
  },

  clearConnection: (connId) => {
    set((s) => {
      const omit = <T,>(o: Record<string, T>): Record<string, T> => {
        const { [connId]: _dropped, ...rest } = o
        return rest
      }
      return {
        byConnection: omit(s.byConnection),
        expanded: omit(s.expanded),
        selectedKey: omit(s.selectedKey),
        openKeys: omit(s.openKeys)
      }
    })
  },

  removeKey: (connId, key) => {
    set((s) => {
      const state = s.byConnection[connId]
      if (!state) return s
      const { [key]: _removed, ...types } = state.types
      // Rebuild the tree from every remaining key (including keys that are also
      // folder prefixes, which a leaf-only walk would drop).
      const root = createRoot()
      const sep = useSettingsStore.getState().keySeparator
      collectKeys(state.root)
        .filter((k) => k !== key)
        .forEach((k) => insertKey(root, k, sep))
      return {
        byConnection: {
          ...s.byConnection,
          [connId]: { ...state, root, types, keyCount: Math.max(0, state.keyCount - 1) }
        }
      }
    })
  }
}))

// re-export for convenience so components only import from one place
export type { TreeNode }
