import { useEffect, useState } from 'react'
import { useConnectionsStore } from '../store/connectionsStore'
import { useKeysStore } from '../store/keysStore'
import { useDialogStore } from '../store/dialogStore'
import { useDbAliasStore } from '../store/dbAliasStore'
import { useToastStore } from '../store/toastStore'
import { useZoomStore, ZOOM_MAX, ZOOM_MIN } from '../store/zoomStore'
import { useSettingsStore } from '../store/settingsStore'
import type { Theme } from '../store/themeStore'
import KeyBrowser from './KeyBrowser'
import ContextMenu, { type MenuItem } from './ContextMenu'
import type { ConnectionProfile } from '../types/connection'

interface Props {
  onAdd: () => void
  onEdit: (profile: ConnectionProfile) => void
  width: number
  theme: Theme
  onToggleTheme: () => void
  // The drag/keyboard resize handle lives inside the sidebar landmark.
  children?: React.ReactNode
}

interface MenuState {
  x: number
  y: number
  profile: ConnectionProfile
}

function Sidebar({
  onAdd,
  onEdit,
  width,
  theme,
  onToggleTheme,
  children
}: Props): React.JSX.Element {
  const profiles = useConnectionsStore((s) => s.profiles)
  const states = useConnectionsStore((s) => s.states)
  const activeProfileId = useConnectionsStore((s) => s.activeProfileId)
  const setActiveProfile = useConnectionsStore((s) => s.setActiveProfile)
  const removeProfile = useConnectionsStore((s) => s.removeProfile)
  const connect = useConnectionsStore((s) => s.connect)
  const disconnect = useConnectionsStore((s) => s.disconnect)
  const selectDb = useConnectionsStore((s) => s.selectDb)
  const resetAndScan = useKeysStore((s) => s.resetAndScan)
  const confirmDialog = useDialogStore((s) => s.confirm)
  const pushToast = useToastStore((s) => s.push)
  // Fire-and-forget promises from click handlers must never become unhandled rejections.
  const reportError = (p: Promise<unknown> | void): void => {
    Promise.resolve(p).catch((err) =>
      pushToast(err instanceof Error ? err.message : String(err), 'error')
    )
  }
  const keySeparator = useSettingsStore((s) => s.keySeparator)
  const setKeySeparator = useSettingsStore((s) => s.setKeySeparator)
  const zoom = useZoomStore((s) => s.zoom)
  const zoomIn = useZoomStore((s) => s.zoomIn)
  const zoomOut = useZoomStore((s) => s.zoomOut)
  const resetZoom = useZoomStore((s) => s.reset)

  // Connected connections can be folded away without disconnecting.
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (!settingsOpen) return
    const close = (): void => setSettingsOpen(false)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [settingsOpen])

  const toggleFold = (id: string): void =>
    setFolded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Single click: connect if needed, otherwise fold/unfold, like ARDM.
  const handleRowClick = (p: ConnectionProfile): void => {
    const status = states[p.id]?.status
    if (status === 'connecting') return
    if (status === 'connected') {
      if (activeProfileId === p.id) toggleFold(p.id)
      else setActiveProfile(p.id)
      return
    }
    setFolded((prev) => {
      const next = new Set(prev)
      next.delete(p.id)
      return next
    })
    setActiveProfile(p.id)
    connect(p.id)
  }

  // Keyboard equivalent of right-click: the Menu key or Shift+F10, anchored to the element.
  const isMenuKey = (e: React.KeyboardEvent): boolean =>
    e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')
  const anchorOf = (el: Element): { x: number; y: number } => {
    const r = el.getBoundingClientRect()
    return { x: r.left + 24, y: r.bottom - 4 }
  }

  const connectionMenuItems = (profile: ConnectionProfile): MenuItem[] => {
    const connected = states[profile.id]?.status === 'connected'
    const items: MenuItem[] = connected
      ? [
          {
            label: 'Refresh',
            onSelect: () => {
              const id = states[profile.id]?.backendId
              if (id) reportError(resetAndScan(id))
            }
          },
          { label: 'Close Connection', onSelect: () => reportError(disconnect(profile.id)) }
        ]
      : [{ label: 'Open Connection', onSelect: () => handleRowClick(profile) }]
    items.push({ label: 'Edit Connection', onSelect: () => onEdit(profile) })
    items.push({ label: 'Delete Connection', danger: true, onSelect: () => handleDelete(profile) })
    return items
  }

  const handleDelete = async (p: ConnectionProfile): Promise<void> => {
    const ok = await confirmDialog(`Delete connection "${p.name}"?`)
    if (ok) reportError(removeProfile(p.id))
  }

  return (
    <aside className="sidebar" style={{ width }} aria-label="Connections">
      <div className="sidebar-header">
        <button className="btn btn-block" onClick={onAdd}>
          <PlusIcon />
          New Connection
        </button>
        <div className="settings-wrap" onClick={(e) => e.stopPropagation()}>
          <button
            className={settingsOpen ? 'btn btn-icon btn-icon-active' : 'btn btn-icon'}
            onClick={() => setSettingsOpen((v) => !v)}
            title="Settings"
            aria-label="Settings"
            aria-haspopup="true"
            aria-expanded={settingsOpen}
          >
            <GearIcon />
          </button>
          {settingsOpen && (
            <div className="settings-panel" role="group" aria-label="Settings">
              <div className="settings-row">
                <span id="settings-theme-label">Theme</span>
                <div className="segmented" role="group" aria-labelledby="settings-theme-label">
                  <button
                    className={theme === 'light' ? 'active' : ''}
                    aria-pressed={theme === 'light'}
                    onClick={() => theme !== 'light' && onToggleTheme()}
                  >
                    <SunIcon /> Light
                  </button>
                  <button
                    className={theme === 'dark' ? 'active' : ''}
                    aria-pressed={theme === 'dark'}
                    onClick={() => theme !== 'dark' && onToggleTheme()}
                  >
                    <MoonIcon /> Dark
                  </button>
                </div>
              </div>
              <div className="settings-row" title="Ctrl +, Ctrl -, Ctrl 0, or Ctrl + mouse wheel">
                <span>Zoom</span>
                <div className="zoom-control">
                  <button
                    className="zoom-btn"
                    onClick={zoomOut}
                    disabled={zoom <= ZOOM_MIN}
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    −
                  </button>
                  <button
                    className="zoom-level"
                    onClick={resetZoom}
                    title="Reset zoom"
                    aria-label={`Zoom ${Math.round(zoom * 100)}%, activate to reset`}
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    className="zoom-btn"
                    onClick={zoomIn}
                    disabled={zoom >= ZOOM_MAX}
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="settings-row" title="Splits key names into folders in the tree">
                <span>Key separator</span>
                <input
                  className="sep-input"
                  aria-label="Key separator"
                  value={keySeparator}
                  maxLength={3}
                  onChange={(e) => setKeySeparator(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <ul className="connection-list">
        {profiles.map((p) => {
          const state = states[p.id]
          const status = state?.status ?? 'idle'
          const isActive = activeProfileId === p.id
          const isOpen = status === 'connected' && !folded.has(p.id)
          return (
            <li key={p.id} className="connection-item">
              <div
                className={isActive ? 'connection-row active' : 'connection-row'}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, profile: p })
                }}
                title={`${p.name} — ${p.host}:${p.port} (${status})`}
              >
                <button
                  className="connection-main"
                  onClick={() => handleRowClick(p)}
                  onKeyDown={(e) => {
                    if (isMenuKey(e)) {
                      e.preventDefault()
                      setMenu({ ...anchorOf(e.currentTarget), profile: p })
                    }
                  }}
                  aria-expanded={status === 'connected' ? isOpen : undefined}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="connection-caret" aria-hidden="true">
                    {status === 'connected' ? <ChevronIcon expanded={isOpen} /> : null}
                  </span>
                  <span className={`status-dot status-${status}`} aria-hidden="true" />
                  {p.icon && <img className="connection-icon" src={p.icon} alt="" />}
                  <span className="connection-name">{p.name}</span>
                  <span className="sr-only">
                    {' '}
                    ({status === 'idle' ? 'not connected' : status})
                  </span>
                  {status === 'connecting' && (
                    <span className="connection-note" aria-hidden="true">
                      connecting…
                    </span>
                  )}
                </button>
                <span className="connection-row-actions">
                  {status === 'connected' && state?.backendId && (
                    <button
                      className="row-icon-btn"
                      onClick={() => {
                        const backendId = state.backendId as string
                        resetAndScan(backendId).catch((err) =>
                          pushToast(err instanceof Error ? err.message : String(err), 'error')
                        )
                      }}
                      title="Refresh connection"
                      aria-label={`Refresh ${p.name}`}
                    >
                      <RefreshIcon />
                    </button>
                  )}
                  <button
                    className="row-icon-btn"
                    onClick={() => onEdit(p)}
                    title="Edit"
                    aria-label={`Edit ${p.name}`}
                  >
                    <EditIcon />
                  </button>
                  <button
                    className="row-icon-btn"
                    onClick={() => handleDelete(p)}
                    title="Delete"
                    aria-label={`Delete ${p.name}`}
                  >
                    <TrashIcon />
                  </button>
                </span>
              </div>

              {status === 'error' && state?.error && (
                <div className="connection-error" role="alert">
                  {state.error}
                </div>
              )}

              {isOpen && state?.backendId && (
                <ConnectionBody
                  profileId={p.id}
                  backendId={state.backendId}
                  currentDb={state.currentDb ?? 0}
                  onSelectDb={(db) => {
                    setActiveProfile(p.id)
                    // Resolves once switched; failures are shown, never left unhandled.
                    return selectDb(p.id, db).catch((err) =>
                      pushToast(err instanceof Error ? err.message : String(err), 'error')
                    )
                  }}
                  onRefresh={() => reportError(resetAndScan(state.backendId as string))}
                />
              )}
            </li>
          )
        })}
        {profiles.length === 0 && (
          <li className="empty">No connections yet — click New Connection to add one</li>
        )}
      </ul>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={connectionMenuItems(menu.profile)}
        />
      )}
      {children}
    </aside>
  )
}

interface BodyProps {
  profileId: string
  backendId: string
  currentDb: number
  onSelectDb: (db: number) => Promise<void> | void
  onRefresh: () => void
}

// Redis defaults to 16 databases (db0-db15); some deployments raise
// `databases` in redis.conf, so we ask the server rather than hardcoding 16.
function ConnectionBody({
  profileId,
  backendId,
  currentDb,
  onSelectDb,
  onRefresh
}: BodyProps): React.JSX.Element {
  const [dbCount, setDbCount] = useState(16)
  const [keyCounts, setKeyCounts] = useState<Record<number, number>>({})
  const [hideEmpty, setHideEmpty] = useState(() => {
    try {
      return localStorage.getItem('rdm.hideEmptyDbs') === '1'
    } catch {
      return false
    }
  })
  // Cap on how many db indexes are listed (db0..db{N-1}); empty = show all.
  const [maxDbs, setMaxDbs] = useState(() => {
    try {
      return localStorage.getItem('rdm.maxDbs') ?? ''
    } catch {
      return ''
    }
  })
  const [countsLoaded, setCountsLoaded] = useState(false)
  const [dbMenu, setDbMenu] = useState<{ x: number; y: number; db: number } | null>(null)
  const aliases = useDbAliasStore((s) => s.aliases)
  const setAlias = useDbAliasStore((s) => s.setAlias)
  const promptDialog = useDialogStore((s) => s.prompt)
  const confirmDialog = useDialogStore((s) => s.confirm)
  const pushToast = useToastStore((s) => s.push)

  const handleRename = async (db: number): Promise<void> => {
    const name = await promptDialog(
      `Rename db${db} (display name only; empty resets)`,
      aliases[`${profileId}:${db}`] ?? ''
    )
    if (name === null) return
    setAlias(profileId, db, name)
  }

  const handleClear = async (db: number): Promise<void> => {
    const label = aliases[`${profileId}:${db}`] ?? `db${db}`
    const ok = await confirmDialog(`Clear ALL keys in ${label} (db${db})? This cannot be undone.`)
    if (!ok) return
    try {
      // One atomic SELECT+FLUSHDB in the main process, then sync the UI to that db.
      await window.api.server.flushDb(backendId, db)
      if (db !== currentDb) await onSelectDb(db)
      pushToast(`Cleared ${label}`, 'success')
      onRefresh()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  // Re-read per-db key counts whenever a key scan (initial load or Refresh) finishes,
  // so the "(n)" next to each db doesn't go stale.
  const scanning = useKeysStore((s) => s.getState(backendId).scanning)

  useEffect(() => {
    let cancelled = false
    window.api.server
      .info(backendId)
      .then((info) => {
        if (cancelled) return
        const counts: Record<number, number> = {}
        for (const row of info.keyspace) counts[row.db] = row.keys
        setDbCount(Math.max(16, ...info.keyspace.map((r) => r.db + 1)))
        setKeyCounts(counts)
        setCountsLoaded(true)
      })
      .catch(() => {
        // fall back to the default 16-db list if INFO/CONFIG isn't available
      })
    return () => {
      cancelled = true
    }
  }, [backendId, currentDb, scanning])

  const toggleHideEmpty = (): void => {
    const next = !hideEmpty
    setHideEmpty(next)
    try {
      localStorage.setItem('rdm.hideEmptyDbs', next ? '1' : '0')
    } catch {
      // ignore — per-viewer convenience only
    }
  }

  const handleMaxDbs = (value: string): void => {
    const cleaned = value.replace(/\D/g, '')
    setMaxDbs(cleaned)
    try {
      localStorage.setItem('rdm.maxDbs', cleaned)
    } catch {
      // ignore — per-viewer convenience only
    }
  }
  const maxDbsNum = Number(maxDbs)

  // Never hide the active db or one you've given a name, and don't hide
  // anything until the key counts have actually arrived.
  const dbs = Array.from({ length: dbCount }, (_, i) => i).filter(
    (db) =>
      (!maxDbsNum || db < maxDbsNum || db === currentDb) &&
      (!hideEmpty ||
      !countsLoaded ||
      db === currentDb ||
      keyCounts[db] > 0 ||
      aliases[`${profileId}:${db}`] !== undefined)
  )

  return (
    <div className="connection-body" onClick={(e) => e.stopPropagation()}>
      <div className="db-options">
        <label className="hide-empty-toggle">
          <input type="checkbox" checked={hideEmpty} onChange={toggleHideEmpty} />
          Hide empty
        </label>
        <label className="max-dbs" title="Show only db0 … db(N-1). Leave empty to show all.">
          Max DBs
          <input
            value={maxDbs}
            onChange={(e) => handleMaxDbs(e.target.value)}
            placeholder={String(dbCount)}
            inputMode="numeric"
          />
        </label>
      </div>
      {dbs.map((db) => {
        const isCurrent = db === currentDb
        const label = aliases[`${profileId}:${db}`] ?? `db${db}`
        return (
          <div key={db} className="db-item">
            <div
              className={isCurrent ? 'db-row active' : 'db-row'}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setDbMenu({ x: e.clientX, y: e.clientY, db })
              }}
            >
              <button
                className="db-main"
                onClick={() => !isCurrent && onSelectDb(db)}
                onKeyDown={(e) => {
                  // Menu key / Shift+F10: keyboard equivalent of right-click.
                  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                    e.preventDefault()
                    const r = e.currentTarget.getBoundingClientRect()
                    setDbMenu({ x: r.left + 24, y: r.bottom - 4, db })
                  }
                }}
                aria-expanded={isCurrent}
                aria-current={isCurrent ? 'true' : undefined}
              >
                <span className="connection-caret" aria-hidden="true">
                  <ChevronIcon expanded={isCurrent} />
                </span>
                <DbIcon />
                <span className="db-row-name">{label}</span>
                {aliases[`${profileId}:${db}`] && <span className="db-row-count">db{db}</span>}
                {keyCounts[db] > 0 && (
                  <span className="db-row-count">
                    <span className="sr-only">, </span>({keyCounts[db].toLocaleString()}
                    <span className="sr-only"> keys</span>)
                  </span>
                )}
              </button>
              {isCurrent && (
                <button
                  className="row-icon-btn db-refresh"
                  onClick={onRefresh}
                  title="Refresh keys"
                  aria-label={`Refresh keys in ${label}`}
                >
                  <RefreshIcon />
                </button>
              )}
            </div>
            {isCurrent && (
              <div className="db-row-keys">
                <KeyBrowser connId={backendId} currentDb={currentDb} />
              </div>
            )}
          </div>
        )
      })}

      {dbMenu && (
        <ContextMenu
          x={dbMenu.x}
          y={dbMenu.y}
          onClose={() => setDbMenu(null)}
          items={[
            { label: 'Rename', onSelect: () => handleRename(dbMenu.db) },
            ...(aliases[`${profileId}:${dbMenu.db}`]
              ? [{ label: 'Reset Name', onSelect: () => setAlias(profileId, dbMenu.db, '') }]
              : []),
            { label: 'Clear (FLUSHDB)', danger: true, onSelect: () => handleClear(dbMenu.db) }
          ]}
        />
      )}
    </div>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }): React.JSX.Element {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s ease' }}
    >
      <path
        d="M5 2.5l6 5.5-6 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DbIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="8" cy="4" rx="5.2" ry="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.8 4v8c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2V4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.8 8c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function RefreshIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function EditIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11 2.5 13.5 5 5.3 13.2 2 14l.8-3.3L11 2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5l.6 8.4a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SunIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="2.8" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function GearIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  )
}

function MoonIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default Sidebar
