import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import ConnectionForm from './components/ConnectionForm'
import KeyTabs, { tabId, TAB_PANEL_ID } from './components/KeyTabs'
import ValueViewer from './components/ValueViewer'
import ServerPanel from './components/ServerPanel'
import CliConsole from './components/CliConsole'
import ToastContainer from './components/ToastContainer'
import DialogHost from './components/DialogHost'
import UpdateBanner from './components/UpdateBanner'
import { useConnectionsStore } from './store/connectionsStore'
import { useKeysStore } from './store/keysStore'
import { useThemeStore } from './store/themeStore'
import { useViewStore } from './store/viewStore'
import { useZoomStore } from './store/zoomStore'
import logo from './assets/logo.png'
import type { ConnectionProfile, ProfileFormValues } from './types/connection'

const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 520
const SIDEBAR_DEFAULT = 300
const SIDEBAR_WIDTH_KEY = 'rdm.sidebarWidth'

function App(): React.JSX.Element {
  const [formOpen, setFormOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | undefined>(undefined)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    return stored >= SIDEBAR_MIN && stored <= SIDEBAR_MAX ? stored : SIDEBAR_DEFAULT
  })
  const resizing = useRef(false)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizing.current = true
    document.body.classList.add('resizing-sidebar')

    const handleMove = (moveEvent: MouseEvent): void => {
      if (!resizing.current) return
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, moveEvent.clientX))
      setSidebarWidth(next)
    }
    const handleUp = (): void => {
      resizing.current = false
      document.body.classList.remove('resizing-sidebar')
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      setSidebarWidth((w) => {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w))
        return w
      })
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [])

  const loadProfiles = useConnectionsStore((s) => s.loadProfiles)
  const addProfile = useConnectionsStore((s) => s.addProfile)
  const updateProfile = useConnectionsStore((s) => s.updateProfile)
  const profiles = useConnectionsStore((s) => s.profiles)
  const loaded = useConnectionsStore((s) => s.loaded)
  const activeProfileId = useConnectionsStore((s) => s.activeProfileId)
  const states = useConnectionsStore((s) => s.states)
  const selectDb = useConnectionsStore((s) => s.selectDb)
  const applyStatusEvent = useConnectionsStore((s) => s.applyStatusEvent)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  // The main process tells us when a live connection drops or recovers.
  useEffect(() => window.api.redis.onStatus(applyStatusEvent), [applyStatusEvent])

  // Zoom: restore the saved level, then Ctrl/Cmd + (=), -, 0 and Ctrl + wheel.
  useEffect(() => {
    const { zoom, zoomIn, zoomOut, reset } = useZoomStore.getState()
    window.api.zoom.set(zoom)

    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        zoomIn()
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        reset()
      }
    }
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      if (e.deltaY < 0) zoomIn()
      else if (e.deltaY > 0) zoomOut()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const activeProfile = profiles.find((p) => p.id === activeProfileId)
  const activeState = activeProfileId ? states[activeProfileId] : undefined
  const currentDb = activeState?.currentDb ?? activeProfile?.db ?? 0
  const selectedKey = useKeysStore((s) =>
    activeState?.backendId ? s.selectedKey[activeState.backendId] : undefined
  )
  const storedView = useViewStore((s) =>
    activeState?.backendId ? s.views[activeState.backendId] : undefined
  )
  // New connections land on the Status tab, like Another Redis Desktop Manager.
  const view = storedView ?? 'status'

  // Global keyboard shortcut: Escape closes the connection form.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && formOpen) {
        setFormOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [formOpen])

  const openAdd = (): void => {
    setEditingProfile(undefined)
    setFormOpen(true)
  }

  const openEdit = (profile: ConnectionProfile): void => {
    setEditingProfile(profile)
    setFormOpen(true)
  }

  const handleSubmit = async (profile: ProfileFormValues): Promise<void> => {
    if (editingProfile) {
      await updateProfile(editingProfile.id, profile)
    } else {
      await addProfile(profile)
    }
    setFormOpen(false)
  }

  return (
    <div className="app-root">
      <UpdateBanner />

      <div className="app-shell">
        <Sidebar
          onAdd={openAdd}
          onEdit={openEdit}
          width={sidebarWidth}
          theme={theme}
          onToggleTheme={toggleTheme}
        >
          <div
            className="sidebar-resizer"
            onMouseDown={handleResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={SIDEBAR_MIN}
            aria-valuemax={SIDEBAR_MAX}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onKeyDown={(e) => {
              // Arrow keys resize in 16px steps; Home/End jump to the limits.
              const step = e.shiftKey ? 48 : 16
              let next: number | null = null
              if (e.key === 'ArrowLeft') next = sidebarWidth - step
              else if (e.key === 'ArrowRight') next = sidebarWidth + step
              else if (e.key === 'Home') next = SIDEBAR_MIN
              else if (e.key === 'End') next = SIDEBAR_MAX
              if (next === null) return
              e.preventDefault()
              const clamped = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, next))
              setSidebarWidth(clamped)
              try {
                localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped))
              } catch {
                // ignore — per-viewer convenience only
              }
            }}
          />
        </Sidebar>

        <main className="main-panel">
          <h1 className="sr-only">RDM Desktop</h1>
          {activeProfile ? (
            activeState?.status === 'connected' && activeState.backendId ? (
              <>
                <KeyTabs connId={activeState.backendId} view={view} />
                <div
                  className="tab-content"
                  id={TAB_PANEL_ID}
                  role="tabpanel"
                  tabIndex={0}
                  aria-labelledby={
                    view === 'key' && selectedKey
                      ? tabId(`key-${selectedKey}`)
                      : tabId(view === 'cli' ? 'cli' : 'status')
                  }
                >
                  {view === 'status' && (
                    <ServerPanel
                      connId={activeState.backendId}
                      currentDb={currentDb}
                      onDbChange={(db) => selectDb(activeProfileId as string, db)}
                      expanded
                    />
                  )}
                  {view === 'cli' && <CliConsole connId={activeState.backendId} />}
                  {view === 'key' &&
                    (selectedKey ? (
                      <ValueViewer connId={activeState.backendId} keyName={selectedKey} />
                    ) : (
                      <div className="empty-state">
                        <EmptyGlyph />
                        <p>Select a key to view its value.</p>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <div className="empty-state landing">
                <EmptyGlyph />
                <p>Connect to browse its keys.</p>
              </div>
            )
          ) : (
            <div className="empty-state landing">
              <img className="landing-logo" src={logo} alt="" />
              <h2 className="landing-title">RDM Desktop</h2>
              <p>
                {loaded
                  ? 'Select a connection on the left, or add a new one.'
                  : 'Loading saved connections…'}
              </p>
            </div>
          )}
        </main>
      </div>

      {formOpen && (
        <ConnectionForm
          initial={editingProfile}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
        />
      )}

      <ToastContainer />
      <DialogHost />
    </div>
  )
}

function EmptyGlyph(): React.JSX.Element {
  return (
    <svg
      className="empty-glyph"
      aria-hidden="true"
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 9.5h18M7 14h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export default App
