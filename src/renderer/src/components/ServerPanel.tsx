import { useEffect, useState } from 'react'
import { useToastStore } from '../store/toastStore'

interface KeyspaceRow {
  db: number
  keys: number
  expires: number
  avgTtl: number
}

interface ServerInfo {
  server: { version?: string; os?: string; processId?: string; port?: string }
  memory: { usedHuman?: string; peakHuman?: string; luaHuman?: string }
  stats: {
    connectedClients?: string
    totalConnectionsReceived?: string
    totalCommandsProcessed?: string
  }
  keyspace: KeyspaceRow[]
}

interface Props {
  connId: string
  currentDb: number
  onDbChange: (db: number) => void
  expanded: boolean
}

function ServerPanel({ connId, currentDb, onDbChange, expanded }: Props): React.JSX.Element | null {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const push = useToastStore((s) => s.push)

  const load = (): void => {
    window.api.server
      .info(connId)
      .then(setInfo)
      .catch(() => {
        // info panel is purely informational — silently skip if unavailable
      })
  }

  // Collapsed by default (this is a "check occasionally" dashboard, not
  // something worth an INFO round-trip and a chunk of vertical space on
  // every single connect) — fetch lazily on first expand, then keep it
  // fresh whenever it's open (reconnect, DB switch).
  useEffect(() => {
    setInfo(null)
    if (expanded) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connId, expanded])

  const handleSelectDb = async (db: number): Promise<void> => {
    if (db === currentDb) return
    try {
      await onDbChange(db)
      push(`Switched to db${db}`, 'success')
      load()
    } catch (err) {
      push(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  if (!expanded) return null

  return (
    <div className="server-panel">
      <div className="info-cards">
        <div className="info-card">
          <div className="info-card-header">
            <ServerIcon />
            <span>Server</span>
          </div>
          <div className="info-row">
            <span>Redis Version</span>
            <strong>{info?.server.version ?? '—'}</strong>
          </div>
          <div className="info-row">
            <span>OS</span>
            <strong>{info?.server.os ?? '—'}</strong>
          </div>
          <div className="info-row">
            <span>Process ID</span>
            <strong>{info?.server.processId ?? '—'}</strong>
          </div>
        </div>

        <div className="info-card">
          <div className="info-card-header">
            <MemoryIcon />
            <span>Memory</span>
          </div>
          <div className="info-row">
            <span>Used Memory</span>
            <strong>{info?.memory.usedHuman ?? '—'}</strong>
          </div>
          <div className="info-row">
            <span>Peak Memory</span>
            <strong>{info?.memory.peakHuman ?? '—'}</strong>
          </div>
          <div className="info-row">
            <span>Lua Memory</span>
            <strong>{info?.memory.luaHuman ?? '—'}</strong>
          </div>
        </div>

        <div className="info-card">
          <div className="info-card-header">
            <StatsIcon />
            <span>Stats</span>
          </div>
          <div className="info-row">
            <span>Connected Clients</span>
            <strong>{info?.stats.connectedClients ?? '—'}</strong>
          </div>
          <div className="info-row">
            <span>Total Connections</span>
            <strong>{info?.stats.totalConnectionsReceived ?? '—'}</strong>
          </div>
          <div className="info-row">
            <span>Total Commands</span>
            <strong>{info?.stats.totalCommandsProcessed ?? '—'}</strong>
          </div>
        </div>
      </div>

      <div className="keystats">
        <div className="keystats-header">
          <ChartIcon />
          <span>Key Statistics</span>
        </div>
        <div className="keystats-table-wrap">
          <table className="keystats-table">
            <thead>
              <tr>
                <th>DB</th>
                <th>Keys</th>
                <th>Expires</th>
                <th>Avg TTL</th>
              </tr>
            </thead>
            <tbody>
              {info?.keyspace.map((row) => (
                <tr
                  key={row.db}
                  className={row.db === currentDb ? 'active' : ''}
                  onClick={() => handleSelectDb(row.db)}
                >
                  <td>
                    <button
                      className="link-btn"
                      onClick={(e) => {
                        e.stopPropagation() // the row also handles clicks
                        handleSelectDb(row.db)
                      }}
                      aria-current={row.db === currentDb ? 'true' : undefined}
                    >
                      db{row.db}
                    </button>
                  </td>
                  <td>{row.keys.toLocaleString()}</td>
                  <td>{row.expires.toLocaleString()}</td>
                  <td>{row.avgTtl.toLocaleString()}</td>
                </tr>
              ))}
              {!info && (
                <tr>
                  <td colSpan={4} className="keystats-loading">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ServerIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2.5" width="12" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="10" width="12" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4.3" cy="4.25" r="0.6" fill="currentColor" />
      <circle cx="4.3" cy="11.75" r="0.6" fill="currentColor" />
    </svg>
  )
}

function MemoryIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5.5 3V1.5M8 3V1.5M10.5 3V1.5M5.5 14.5V13M8 14.5V13M10.5 14.5V13M3 5.5H1.5M3 8H1.5M3 10.5H1.5M14.5 5.5H13M14.5 8H13M14.5 10.5H13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function StatsIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 14V2M2 14h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M4.5 11.5V9M8 11.5V6.5M11.5 11.5V4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChartIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 3v10h10"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 10.5l2.2-2.6L9 9.5l3-4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default ServerPanel
