import { useKeysStore } from '../store/keysStore'
import { useViewStore, type MainView } from '../store/viewStore'

interface Props {
  connId: string
  view: MainView
}

// Id of the tab button for each destination; the panel in App points back at
// the active one with aria-labelledby.
export const tabId = (kind: string): string => `tab-${kind.replace(/[^a-zA-Z0-9_-]/g, '_')}`
export const TAB_PANEL_ID = 'main-tab-panel'

// Browser-style card tabs, like Another Redis Desktop Manager: fixed
// "Status" and "CLI" tabs followed by one closable tab per opened key.
// Keyboard: Left/Right/Home/End move between tabs, Delete closes a key tab.
function KeyTabs({ connId, view }: Props): React.JSX.Element {
  const openKeys = useKeysStore((s) => s.openKeys[connId]) ?? []
  const selectedKey = useKeysStore((s) => s.selectedKey[connId])
  const selectKey = useKeysStore((s) => s.selectKey)
  const closeKey = useKeysStore((s) => s.closeKey)
  const setView = useViewStore((s) => s.setView)

  type Tab = { id: string; kind: 'status' | 'cli' | 'key'; key?: string; active: boolean }
  const tabs: Tab[] = [
    { id: tabId('status'), kind: 'status', active: view === 'status' },
    { id: tabId('cli'), kind: 'cli', active: view === 'cli' },
    ...openKeys.map((key) => ({
      id: tabId(`key-${key}`),
      kind: 'key' as const,
      key,
      active: view === 'key' && key === selectedKey
    }))
  ]

  const activate = (tab: Tab): void => {
    if (tab.kind === 'key' && tab.key !== undefined) {
      selectKey(connId, tab.key)
      setView(connId, 'key')
    } else {
      setView(connId, tab.kind)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const index = tabs.findIndex((t) => t.active)
    let next = -1
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else if (e.key === 'Delete' && tabs[index]?.kind === 'key') {
      e.preventDefault()
      closeKey(connId, tabs[index].key as string)
      return
    }
    if (next < 0) return
    e.preventDefault()
    activate(tabs[next])
    // Move focus with the selection (automatic activation).
    requestAnimationFrame(() => document.getElementById(tabs[next].id)?.focus())
  }

  return (
    <div className="key-tabs" role="tablist" aria-label="Open tabs" onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <div key={tab.id} className={tab.active ? 'key-tab active' : 'key-tab'}>
          <button
            id={tab.id}
            role="tab"
            className="key-tab-label"
            aria-selected={tab.active}
            aria-controls={TAB_PANEL_ID}
            aria-keyshortcuts={tab.kind === 'key' ? 'Delete' : undefined}
            // Roving tabindex: the active tab is the one tab stop; arrows reach the rest.
            tabIndex={tab.active ? 0 : -1}
            title={tab.key ? `${tab.key} — press Delete to close` : undefined}
            onClick={() => activate(tab)}
          >
            {tab.kind === 'status' && <StatusTabIcon />}
            {tab.kind === 'cli' && <CliTabIcon />}
            <span className="key-tab-name">
              {tab.kind === 'status' ? 'Status' : tab.kind === 'cli' ? 'CLI' : tab.key}
            </span>
          </button>
          {tab.kind === 'key' && (
            // Mouse shortcut only. A tablist may contain nothing but tabs, so this is
            // hidden from assistive tech; keyboard and screen-reader users press Delete
            // on the focused tab (advertised via aria-keyshortcuts).
            <button
              className="key-tab-close"
              onClick={() => closeKey(connId, tab.key as string)}
              title="Close"
              aria-hidden="true"
              tabIndex={-1}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function StatusTabIcon(): React.JSX.Element {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M2 14V2M2 14h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.5 11.5V9M8 11.5V6.5M11.5 11.5V4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CliTabIcon(): React.JSX.Element {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 6l2.2 2-2.2 2M8.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export default KeyTabs
