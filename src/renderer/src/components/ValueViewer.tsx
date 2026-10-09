import { useEffect, useState } from 'react'
import { useKeysStore } from '../store/keysStore'
import { useToastStore } from '../store/toastStore'
import { useDialogStore } from '../store/dialogStore'

interface KeyValue {
  type: string
  value: unknown
  truncated?: boolean
  binary?: boolean // string whose bytes aren't valid UTF-8: value is a read-only hex dump
  size?: number // string length in bytes
}

interface KeyDetail {
  key: string
  ttl: number
  data: KeyValue
}

interface Props {
  connId: string
  keyName: string
}

function formatTtl(ttl: number): string {
  if (ttl === -1) return 'No expiry'
  if (ttl === -2) return 'Key missing'
  if (ttl < 60) return `${ttl}s`
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m ${ttl % 60}s`
  return `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`
}

function ValueViewer({ connId, keyName }: Props): React.JSX.Element {
  const [detail, setDetail] = useState<KeyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const openKey = useKeysStore((s) => s.openKey)
  const closeKey = useKeysStore((s) => s.closeKey)
  const removeKeyFromTree = useKeysStore((s) => s.removeKey)
  const resetAndScan = useKeysStore((s) => s.resetAndScan)
  const pushToast = useToastStore((s) => s.push)
  const confirmDialog = useDialogStore((s) => s.confirm)
  const promptDialog = useDialogStore((s) => s.prompt)

  const load = (): void => {
    setLoading(true)
    setError(null)
    window.api.keys
      .getValue(connId, keyName)
      .then((d) => setDetail(d as KeyDetail))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connId, keyName])

  const run = async (fn: () => Promise<void>, refreshTree = false): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (refreshTree) {
        await resetAndScan(connId)
      } else {
        load()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      pushToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    const ok = await confirmDialog(`Delete key "${keyName}"? This cannot be undone.`)
    if (!ok) return
    run(async () => {
      await window.api.keys.delete(connId, keyName)
      removeKeyFromTree(connId, keyName)
      closeKey(connId, keyName)
      pushToast(`Deleted "${keyName}"`, 'success')
    })
  }

  const handleRename = async (): Promise<void> => {
    const newKey = await promptDialog('New key name', keyName)
    if (!newKey || newKey === keyName) return
    run(async () => {
      await window.api.value.rename(connId, keyName, newKey)
      closeKey(connId, keyName)
      openKey(connId, newKey)
      pushToast(`Renamed to "${newKey}"`, 'success')
    }, true)
  }

  const handleDuplicate = async (): Promise<void> => {
    const newKey = await promptDialog('Duplicate as', `${keyName}:copy`)
    if (!newKey) return
    run(async () => {
      await window.api.value.duplicate(connId, keyName, newKey)
      openKey(connId, newKey)
    }, true)
  }

  const handleSetTtl = async (): Promise<void> => {
    const seconds = await promptDialog('TTL in seconds (empty = no change)')
    if (seconds === null || seconds === '') return
    const n = Number(seconds)
    if (!Number.isFinite(n) || n <= 0) return
    run(() => window.api.value.expire(connId, keyName, n))
  }

  const handlePersist = (): void => {
    run(() => window.api.value.persist(connId, keyName))
  }

  if (loading) return <div className="value-viewer">Loading…</div>
  if (error && !detail) return <div className="value-viewer error">Error: {error}</div>
  if (!detail) return <div className="value-viewer">Nothing to show</div>

  const { data, ttl } = detail

  return (
    <div className="value-viewer">
      <div className="value-toolbar">
        <span className={`type-tag type-tag-${data.type}`}>{data.type}</span>

        <button
          className="value-key-box"
          disabled={busy}
          onClick={handleRename}
          title="Click to rename"
          aria-label={`Key ${detail.key}. Activate to rename.`}
        >
          {detail.key}
        </button>

        <div className="value-ttl-box" role="group" aria-label={`Time to live: ${formatTtl(ttl)}`}>
          <TtlIcon />
          <span className="value-ttl-text">{formatTtl(ttl)}</span>
          <button
            className="value-ttl-btn"
            disabled={busy}
            onClick={handleSetTtl}
            title="Set TTL"
            aria-label="Set TTL"
          >
            <EditIcon />
          </button>
          <button
            className="value-ttl-btn"
            disabled={busy || ttl === -1}
            onClick={handlePersist}
            title="Clear TTL (persist)"
            aria-label="Clear TTL (make persistent)"
          >
            <CheckIcon />
          </button>
        </div>

        <div className="value-toolbar-spacer" />

        <button
          className="btn btn-icon btn-icon-danger"
          disabled={busy}
          onClick={handleDelete}
          title="Delete key"
          aria-label="Delete key"
        >
          <TrashIcon />
        </button>
        <button
          className="btn btn-icon btn-icon-success"
          disabled={busy}
          onClick={load}
          title="Refresh"
          aria-label="Refresh value"
        >
          <RefreshIcon />
        </button>
        <button
          className="btn btn-icon btn-icon-info"
          disabled={busy}
          onClick={handleDuplicate}
          title="Duplicate key"
          aria-label="Duplicate key"
        >
          <DuplicateIcon />
        </button>
      </div>

      {error && <p className="error-note">{error}</p>}

      {data.truncated && (
        <p className="truncated-note">
          Showing first 500 items — full pagination for large collections lands in a later step.
        </p>
      )}

      {data.type === 'none' && <p className="empty">Key does not exist (may have expired).</p>}

      {data.type === 'string' && (
        <StringEditor
          value={data.value as string}
          binary={Boolean(data.binary)}
          size={data.size}
          busy={busy}
          onSave={(v) => run(() => window.api.value.setString(connId, keyName, v))}
        />
      )}

      {data.type === 'hash' && (
        <HashEditor
          value={data.value as Record<string, string>}
          busy={busy}
          onSet={(f, v) => run(() => window.api.value.hashSet(connId, keyName, f, v))}
          onDelete={(f) => run(() => window.api.value.hashDelete(connId, keyName, f))}
        />
      )}

      {data.type === 'list' && (
        <ListEditor
          value={data.value as string[]}
          busy={busy}
          onSet={(i, v) => run(() => window.api.value.listSet(connId, keyName, i, v))}
          onRemove={(i) => run(() => window.api.value.listRemoveAt(connId, keyName, i))}
          onPush={(v) => run(() => window.api.value.listPush(connId, keyName, v, 'tail'))}
        />
      )}

      {data.type === 'set' && (
        <SetEditor
          value={data.value as string[]}
          busy={busy}
          onAdd={(m) => run(() => window.api.value.setAdd(connId, keyName, m))}
          onRemove={(m) => run(() => window.api.value.setRemove(connId, keyName, m))}
        />
      )}

      {data.type === 'zset' && (
        <ZsetEditor
          value={data.value as { member: string; score: number }[]}
          busy={busy}
          onSet={(m, s) => run(() => window.api.value.zsetAdd(connId, keyName, m, s))}
          onRemove={(m) => run(() => window.api.value.zsetRemove(connId, keyName, m))}
        />
      )}

      {data.type === 'stream' && (
        <table className="value-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fields</th>
            </tr>
          </thead>
          <tbody>
            {(data.value as { id: string; fields: Record<string, string> }[]).map((entry) => (
              <tr key={entry.id}>
                <td>{entry.id}</td>
                <td>
                  {Object.entries(entry.fields)
                    .map(([f, v]) => `${f}=${v}`)
                    .join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function TtlIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EditIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11 2.5 13.5 5 5.3 13.2 2 14l.8-3.3L11 2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8.5 6.3 12 13 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
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

function RefreshIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
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

function DuplicateIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.5 5.5V3.7a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h1.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function parseJson(value: string): unknown | undefined {
  try {
    const parsed = JSON.parse(value)
    if (parsed !== null && typeof parsed === 'object') return parsed
    return undefined
  } catch {
    return undefined
  }
}

function allContainerPaths(data: unknown, path = '$'): string[] {
  const isArray = Array.isArray(data)
  const isObject = !isArray && data !== null && typeof data === 'object'
  if (!isArray && !isObject) return []
  const entries = isArray
    ? (data as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(data as Record<string, unknown>)
  return [path, ...entries.flatMap(([k, v]) => allContainerPaths(v, `${path}.${k}`))]
}

function StringEditor({
  value,
  binary,
  size,
  busy,
  onSave
}: {
  value: string
  binary: boolean
  size?: number
  busy: boolean
  onSave: (v: string) => void
}): React.JSX.Element {
  // The draft starts as the exact stored text. Pretty-printing only ever
  // happens on request (Format), so opening + saving can't rewrite the value.
  const [draft, setDraft] = useState(value)
  const initialJson = useState(() => parseJson(value))[0]
  const [mode, setMode] = useState<'tree' | 'raw'>(initialJson !== undefined ? 'tree' : 'raw')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => setDraft(value), [value])

  const dirty = draft !== value
  const draftJson = binary ? undefined : parseJson(draft)

  const handleCopy = (): void => {
    navigator.clipboard?.writeText(draft).catch(() => {})
  }

  if (binary) {
    return (
      <div className="string-editor">
        <p className="truncated-note">
          Binary value ({(size ?? 0).toLocaleString()} bytes) — not valid text, so it is shown as a
          read-only hex dump. Editing is disabled to avoid corrupting it.
        </p>
        <textarea
          className="value-textarea"
          aria-label="Binary value as hex dump (read-only)"
          value={value}
          readOnly
          rows={14}
          wrap="off"
        />
      </div>
    )
  }

  return (
    <div className="string-editor">
      {draftJson !== undefined && (
        <div className="json-toolbar">
          <select
            aria-label="JSON view mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'tree' | 'raw')}
          >
            <option value="tree">Json</option>
            <option value="raw">Raw</option>
          </select>
          {mode === 'tree' && (
            <>
              <button
                className="btn btn-xs"
                onClick={() => setCollapsed(new Set(allContainerPaths(draftJson)))}
              >
                Collapse All
              </button>
              <button className="btn btn-xs" onClick={() => setCollapsed(new Set())}>
                Expand All
              </button>
            </>
          )}
          {mode === 'raw' && (
            <button
              className="btn btn-xs"
              onClick={() => setDraft(JSON.stringify(draftJson, null, 2))}
              title="Pretty-print the JSON (marks the value as changed)"
            >
              Format
            </button>
          )}
          <button className="btn btn-xs" onClick={handleCopy}>
            Copy
          </button>
          <span className="json-size-badge">Size: {new Blob([draft]).size}B</span>
        </div>
      )}

      {mode === 'tree' && draftJson !== undefined ? (
        <div className="json-tree-wrap">
          <JsonTree
            data={draftJson}
            path="$"
            depth={0}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
          />
        </div>
      ) : (
        <textarea
          className="value-textarea"
          aria-label="String value"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
        />
      )}

      <div className="editor-footer">
        <button
          className="btn btn-primary"
          disabled={busy || !dirty}
          title={dirty ? 'Save changes' : 'No changes to save'}
          onClick={() => onSave(draft)}
        >
          Save
        </button>
      </div>
    </div>
  )
}

function JsonTree({
  data,
  path,
  depth,
  collapsed,
  setCollapsed
}: {
  data: unknown
  path: string
  depth: number
  collapsed: Set<string>
  setCollapsed: (s: Set<string>) => void
}): React.JSX.Element {
  const isArray = Array.isArray(data)
  const isObject = !isArray && data !== null && typeof data === 'object'

  if (!isArray && !isObject) {
    return <JsonScalar value={data} />
  }

  const entries = isArray
    ? (data as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(data as Record<string, unknown>)

  const isCollapsed = collapsed.has(path)

  const toggle = (): void => {
    const next = new Set(collapsed)
    if (isCollapsed) next.delete(path)
    else next.add(path)
    setCollapsed(next)
  }

  return (
    <div className="json-node" style={{ paddingLeft: depth === 0 ? 0 : 14 }}>
      <div className="json-node-header" onClick={toggle}>
        <span className="json-chevron">{isCollapsed ? '▸' : '▾'}</span>
        <span className="json-bracket">{isArray ? '[' : '{'}</span>
        {isCollapsed && (
          <span className="json-collapsed-summary">
            {entries.length} {isArray ? 'items' : 'keys'}
          </span>
        )}
      </div>
      {!isCollapsed && (
        <div className="json-children">
          {entries.map(([k, v]) => (
            <div key={k} className="json-entry">
              <span className="json-key">{isArray ? undefined : `"${k}"`}</span>
              {!isArray && <span className="json-colon">: </span>}
              <JsonTree
                data={v}
                path={`${path}.${k}`}
                depth={depth + 1}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
              />
            </div>
          ))}
        </div>
      )}
      {!isCollapsed && <div className="json-bracket" style={{ paddingLeft: depth === 0 ? 0 : 14 }}>{isArray ? ']' : '}'}</div>}
    </div>
  )
}

function JsonScalar({ value }: { value: unknown }): React.JSX.Element {
  if (value === null) return <span className="json-null">null</span>
  if (typeof value === 'string') return <span className="json-string">&quot;{value}&quot;</span>
  if (typeof value === 'number') return <span className="json-number">{value}</span>
  if (typeof value === 'boolean') return <span className="json-boolean">{String(value)}</span>
  return <span>{String(value)}</span>
}

function HashEditor({
  value,
  busy,
  onSet,
  onDelete
}: {
  value: Record<string, string>
  busy: boolean
  onSet: (field: string, v: string) => void
  onDelete: (field: string) => void
}): React.JSX.Element {
  const [newField, setNewField] = useState('')
  const [newValue, setNewValue] = useState('')
  return (
    <table className="value-table editable">
      <thead>
        <tr>
          <th>Field</th>
          <th>Value</th>
          <th>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(value).map(([field, val]) => (
          <EditableRow
            key={field}
            label={field}
            initialValue={val}
            busy={busy}
            onSave={(v) => onSet(field, v)}
            onDelete={() => onDelete(field)}
          />
        ))}
        <tr>
          <td>
            <input value={newField} onChange={(e) => setNewField(e.target.value)} placeholder="new field" aria-label="New field name" />
          </td>
          <td>
            <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="value" aria-label="New field value" />
          </td>
          <td>
            <button
              disabled={busy || !newField}
              onClick={() => {
                onSet(newField, newValue)
                setNewField('')
                setNewValue('')
              }}
            >
              Add
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function ListEditor({
  value,
  busy,
  onSet,
  onRemove,
  onPush
}: {
  value: string[]
  busy: boolean
  onSet: (index: number, v: string) => void
  onRemove: (index: number) => void
  onPush: (v: string) => void
}): React.JSX.Element {
  const [newValue, setNewValue] = useState('')
  return (
    <table className="value-table editable">
      <thead>
        <tr>
          <th>#</th>
          <th>Value</th>
          <th>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {value.map((val, i) => (
          <EditableRow
            key={i}
            label={String(i)}
            initialValue={val}
            busy={busy}
            onSave={(v) => onSet(i, v)}
            onDelete={() => onRemove(i)}
          />
        ))}
        <tr>
          <td />
          <td>
            <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="new item" aria-label="New list item" />
          </td>
          <td>
            <button
              disabled={busy || !newValue}
              onClick={() => {
                onPush(newValue)
                setNewValue('')
              }}
            >
              Append
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function SetEditor({
  value,
  busy,
  onAdd,
  onRemove
}: {
  value: string[]
  busy: boolean
  onAdd: (m: string) => void
  onRemove: (m: string) => void
}): React.JSX.Element {
  const [newMember, setNewMember] = useState('')
  return (
    <div>
      <ul className="value-list editable">
        {value.map((m) => (
          <li key={m}>
            <span>{m}</span>
            <button disabled={busy} onClick={() => onRemove(m)} aria-label={`Remove ${m}`}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <input value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="new member" aria-label="New set member" />
        <button
          disabled={busy || !newMember}
          onClick={() => {
            onAdd(newMember)
            setNewMember('')
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
}

function ZsetEditor({
  value,
  busy,
  onSet,
  onRemove
}: {
  value: { member: string; score: number }[]
  busy: boolean
  onSet: (member: string, score: number) => void
  onRemove: (member: string) => void
}): React.JSX.Element {
  const [newMember, setNewMember] = useState('')
  const [newScore, setNewScore] = useState('0')
  return (
    <table className="value-table editable">
      <thead>
        <tr>
          <th>Member</th>
          <th>Score</th>
          <th>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {value.map((entry) => (
          <EditableRow
            key={entry.member}
            label={entry.member}
            initialValue={String(entry.score)}
            busy={busy}
            onSave={(v) => onSet(entry.member, Number(v) || 0)}
            onDelete={() => onRemove(entry.member)}
          />
        ))}
        <tr>
          <td>
            <input value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="new member" aria-label="New member" />
          </td>
          <td>
            <input value={newScore} onChange={(e) => setNewScore(e.target.value)} type="number" aria-label="New member score" />
          </td>
          <td>
            <button
              disabled={busy || !newMember}
              onClick={() => {
                onSet(newMember, Number(newScore) || 0)
                setNewMember('')
                setNewScore('0')
              }}
            >
              Add
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function EditableRow({
  label,
  initialValue,
  busy,
  onSave,
  onDelete
}: {
  label: string
  initialValue: string
  busy: boolean
  onSave: (v: string) => void
  onDelete: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(initialValue)
  useEffect(() => setDraft(initialValue), [initialValue])
  const dirty = draft !== initialValue
  return (
    <tr>
      <td>{label}</td>
      <td>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Value of ${label}`}
        />
      </td>
      <td className="row-actions">
        <button disabled={busy || !dirty} onClick={() => onSave(draft)}>
          Save
        </button>
        <button disabled={busy} onClick={onDelete} aria-label={`Delete ${label}`} title="Delete">
          <span aria-hidden="true">✕</span>
        </button>
      </td>
    </tr>
  )
}

export default ValueViewer
