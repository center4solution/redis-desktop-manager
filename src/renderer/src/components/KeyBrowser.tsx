import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FixedSizeList, type ListChildComponentProps } from 'react-window'
import { useKeysStore } from '../store/keysStore'
import { useToastStore } from '../store/toastStore'
import { useDialogStore } from '../store/dialogStore'
import { useViewStore } from '../store/viewStore'
import { useSettingsStore } from '../store/settingsStore'
import { flatten, findNode, collectKeys, type FlatRow } from '../lib/keyTree'
import ContextMenu from './ContextMenu'

interface Props {
  connId: string
  currentDb: number
}

const ROW_HEIGHT = 30

interface RowData {
  rows: FlatRow[]
  types: Record<string, string>
  selectedKey: string | undefined
  selectMode: boolean
  selected: Set<string>
  expanded: Set<string>
  focusIndex: number
  treeFocused: boolean
  rowId: (i: number) => string
  keysUnder: (row: FlatRow) => string[]
  activate: (row: FlatRow) => void
  toggleKeys: (keys: string[]) => void
  focus: (i: number) => void
  openMenu: (row: FlatRow, x: number, y: number) => void
}

// Declared at module level on purpose: react-window uses this as a component
// *type*, so a function re-created on every KeyBrowser render would remount every
// row each time (e.g. on the focus change a mouse-down causes), swallowing the click.
function TreeRow({ index, style, data }: ListChildComponentProps<RowData>): React.JSX.Element {
  const { rows, types, selectedKey, selectMode, selected, expanded, rowId } = data
  const row = rows[index]
  const type = row.fullKey ? types[row.fullKey] : undefined
  let checked = false
  let partial = false
  if (selectMode) {
    const ks = data.keysUnder(row)
    const n = ks.filter((k) => selected.has(k)).length
    checked = ks.length > 0 && n === ks.length
    partial = n > 0 && n < ks.length
  }
  return (
    <div
      id={rowId(index)}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-posinset={index + 1}
      aria-setsize={rows.length}
      aria-expanded={row.isLeaf ? undefined : expanded.has(row.path)}
      aria-selected={selectMode ? checked : row.isLeaf ? row.fullKey === selectedKey : undefined}
      style={{ ...style, paddingLeft: row.depth * 16 + 6 }}
      className={[
        row.isLeaf
          ? `key-row leaf ${row.fullKey === selectedKey ? 'selected' : ''}`
          : 'key-row folder',
        data.treeFocused && index === data.focusIndex ? 'focused' : ''
      ]
        .join(' ')
        .trim()}
      onClick={() => {
        data.focus(index)
        data.activate(row)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        data.focus(index)
        data.openMenu(row, e.clientX, e.clientY)
      }}
    >
      {selectMode && (
        <input
          type="checkbox"
          className="key-check"
          checked={checked}
          ref={(el) => {
            if (el) el.indeterminate = partial
          }}
          tabIndex={-1}
          aria-label={`Select ${row.name || '(empty)'}`}
          onClick={(e) => e.stopPropagation()}
          onChange={() => data.toggleKeys(data.keysUnder(row))}
        />
      )}
      {!row.isLeaf ? (
        <>
          <span className="folder-icon" aria-hidden="true">
            <CaretIcon expanded={expanded.has(row.path)} />
          </span>
          <FolderIcon open={expanded.has(row.path)} />
        </>
      ) : (
        <span className="folder-icon" />
      )}
      {row.isLeaf && type && <span className={`type-tag type-tag-${type}`}>{type}</span>}
      <span className="key-row-name" title={row.fullKey ?? row.path}>
        {row.name || <em className="empty-segment">(empty)</em>}
      </span>
      {!row.isLeaf && (
        <span className="folder-count">
          <span className="sr-only">, </span>({row.childCount}
          <span className="sr-only"> keys</span>)
        </span>
      )}
    </div>
  )
}

function KeyBrowser({ connId, currentDb }: Props): React.JSX.Element {
  const state = useKeysStore((s) => s.getState(connId))
  const expandedMap = useKeysStore((s) => s.expanded[connId])
  const selectedKey = useKeysStore((s) => s.selectedKey[connId])
  const resetAndScan = useKeysStore((s) => s.resetAndScan)
  const setPattern = useKeysStore((s) => s.setPattern)
  const toggleExpanded = useKeysStore((s) => s.toggleExpanded)
  const openKeyInStore = useKeysStore((s) => s.openKey)
  const setView = useViewStore((s) => s.setView)
  const sep = useSettingsStore((s) => s.keySeparator)
  const pushToast = useToastStore((s) => s.push)
  const promptDialog = useDialogStore((s) => s.prompt)
  const confirmDialog = useDialogStore((s) => s.confirm)
  const closeKey = useKeysStore((s) => s.closeKey)
  const openKeys = useKeysStore((s) => s.openKeys[connId])

  const [patternInput, setPatternInput] = useState('*')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; keys: string[]; label: string } | null>(
    null
  )
  const [listHeight, setListHeight] = useState(() => window.innerHeight)
  // Keyboard focus inside the tree: one tab stop, rows addressed through
  // aria-activedescendant (rows are virtualized, so they can't each take focus).
  const [focusIndex, setFocusIndex] = useState(0)
  const [treeFocused, setTreeFocused] = useState(false)
  const listRef = useRef<FixedSizeList>(null)
  const idPrefix = useId()
  const rowId = (i: number): string => `${idPrefix}-row-${i}`

  useEffect(() => {
    const onResize = (): void => setListHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const openKey = (id: string, key: string): void => {
    openKeyInStore(id, key)
    setView(id, 'key')
  }

  useEffect(() => {
    resetAndScan(connId).catch((err) =>
      pushToast(err instanceof Error ? err.message : String(err), 'error')
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connId, currentDb, sep])

  const expanded = expandedMap ?? new Set<string>()
  // state.root is mutated in place as scan pages arrive, so keyCount is what
  // signals that the tree has changed and the rows must be rebuilt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => flatten(state.root, expanded), [state.root, state.keyCount, expanded])

  // Selection is per scan; drop it when the db/connection/pattern changes.
  useEffect(() => {
    setSelected(new Set())
    setSelectMode(false)
  }, [connId, currentDb])

  // Per-folder key lists are costly on huge trees and were being rebuilt for every
  // visible row on every redraw in select mode; cache them until the tree changes.
  const keysCache = useRef<{ root: unknown; count: number; map: Map<string, string[]> }>({
    root: null,
    count: -1,
    map: new Map()
  })
  const keysUnder = (row: { isLeaf: boolean; fullKey?: string; path: string }): string[] => {
    if (row.isLeaf) return row.fullKey ? [row.fullKey] : []
    const cache = keysCache.current
    if (cache.root !== state.root || cache.count !== state.keyCount) {
      cache.root = state.root
      cache.count = state.keyCount
      cache.map = new Map()
    }
    let keys = cache.map.get(row.path)
    if (!keys) {
      const node = findNode(state.root, row.path, sep)
      keys = node ? collectKeys(node) : []
      cache.map.set(row.path, keys)
    }
    return keys
  }

  const toggleKeys = (keys: string[]): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      const allIn = keys.every((k) => next.has(k))
      keys.forEach((k) => (allIn ? next.delete(k) : next.add(k)))
      return next
    })

  const deleteKeys = async (keys: string[], label: string): Promise<void> => {
    if (keys.length === 0) return
    const ok = await confirmDialog(
      `Delete ${keys.length === 1 ? `key "${keys[0]}"` : `${keys.length.toLocaleString()} keys (${label})`}? This cannot be undone.`
    )
    if (!ok) return
    try {
      const removed = await window.api.keys.deleteMany(connId, keys)
      const gone = new Set(keys)
      ;(openKeys ?? []).filter((k) => gone.has(k)).forEach((k) => closeKey(connId, k))
      setSelected(new Set())
      await resetAndScan(connId)
      pushToast(`Deleted ${removed.toLocaleString()} key${removed === 1 ? '' : 's'}`, 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const deleteLabel = (row: FlatRow): string =>
    // With a search active only the loaded matches exist in the tree, so say so
    // rather than implying every key under the prefix.
    row.isLeaf
      ? row.name
      : state.pattern && state.pattern !== '*'
        ? `${row.path}${sep}* matching "${state.pattern}"`
        : `${row.path}${sep}*`

  const openMenuFor = (row: FlatRow, x: number, y: number): void =>
    setMenu({ x, y, keys: keysUnder(row), label: deleteLabel(row) })

  const activate = (row: FlatRow): void => {
    if (row.isLeaf) {
      if (selectMode) toggleKeys(keysUnder(row))
      else openKey(connId, row.fullKey as string)
    } else {
      toggleExpanded(connId, row.path)
    }
  }

  const moveFocus = (next: number): void => {
    const clamped = Math.max(0, Math.min(rows.length - 1, next))
    setFocusIndex(clamped)
    listRef.current?.scrollToItem(clamped)
  }

  // Standard tree keyboard model (WAI-ARIA tree view pattern).
  const onTreeKeyDown = (e: React.KeyboardEvent): void => {
    if (rows.length === 0) return
    const index = Math.min(focusIndex, rows.length - 1)
    const row = rows[index]
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        moveFocus(index + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        moveFocus(index - 1)
        break
      case 'Home':
        e.preventDefault()
        moveFocus(0)
        break
      case 'End':
        e.preventDefault()
        moveFocus(rows.length - 1)
        break
      case 'PageDown':
        e.preventDefault()
        moveFocus(index + 10)
        break
      case 'PageUp':
        e.preventDefault()
        moveFocus(index - 10)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (!row.isLeaf) {
          if (!expanded.has(row.path)) toggleExpanded(connId, row.path)
          else moveFocus(index + 1) // already open: step into the first child
        }
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (!row.isLeaf && expanded.has(row.path)) {
          toggleExpanded(connId, row.path)
        } else {
          // Jump to the parent folder (nearest earlier row one level up).
          for (let i = index - 1; i >= 0; i--) {
            if (rows[i].depth < row.depth) {
              moveFocus(i)
              break
            }
          }
        }
        break
      case 'Enter':
        e.preventDefault()
        activate(row)
        break
      case ' ':
        e.preventDefault()
        if (selectMode) toggleKeys(keysUnder(row))
        else activate(row)
        break
      case 'Delete':
        e.preventDefault()
        deleteKeys(keysUnder(row), deleteLabel(row))
        break
      default:
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault()
          const el = document.getElementById(rowId(index))
          const r = (el ?? e.currentTarget).getBoundingClientRect()
          openMenuFor(row, r.left + 24, r.bottom - 4)
        }
    }
  }

  const rowData: RowData = {
    rows,
    types: state.types,
    selectedKey,
    selectMode,
    selected,
    expanded,
    focusIndex: Math.min(focusIndex, rows.length - 1),
    treeFocused,
    rowId,
    keysUnder,
    activate,
    toggleKeys,
    focus: setFocusIndex,
    openMenu: openMenuFor
  }

  const handleSearch = (): void => {
    setPattern(connId, patternInput.trim() || '*')
    setTimeout(
      () =>
        resetAndScan(connId).catch((err) =>
          pushToast(err instanceof Error ? err.message : String(err), 'error')
        ),
      0
    )
  }

  const handleNewKey = async (): Promise<void> => {
    const key = await promptDialog('New key name')
    if (!key || !key.trim()) return
    try {
      // New keys start as an empty string; switch its type via the CLI
      // (HSET/SADD/etc.) if you want something else. Create-only: an
      // existing key is never overwritten.
      await window.api.value.createString(connId, key.trim(), '')
      openKey(connId, key.trim())
      await resetAndScan(connId)
      pushToast(`Created "${key.trim()}"`, 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  return (
    <div className="key-browser">
      <div className="key-browser-toolbar">
        <div className="key-search">
          <input
            value={patternInput}
            onChange={(e) => setPatternInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={`Enter to search, e.g. user${sep}*`}
            aria-label="Search keys by pattern"
          />
          <button
            className="key-search-btn"
            onClick={handleSearch}
            title="Search"
            aria-label="Search"
          >
            <SearchIcon />
          </button>
        </div>
        <button
          className={selectMode ? 'btn btn-icon btn-icon-active' : 'btn btn-icon'}
          onClick={() => {
            setSelectMode((v) => !v)
            setSelected(new Set())
          }}
          title="Select keys to delete"
          aria-label="Select keys to delete"
          aria-pressed={selectMode}
        >
          <SelectIcon />
        </button>
        <button
          className="btn btn-icon"
          onClick={handleNewKey}
          title="Create a new key"
          aria-label="Create a new key"
        >
          <PlusIcon />
        </button>
      </div>

      <div
        className="key-browser-list key-tree"
        role="tree"
        aria-label="Keys"
        aria-multiselectable={selectMode || undefined}
        tabIndex={0}
        aria-activedescendant={rows.length > 0 ? rowId(Math.min(focusIndex, rows.length - 1)) : undefined}
        onKeyDown={onTreeKeyDown}
        onFocus={() => setTreeFocused(true)}
        onBlur={() => setTreeFocused(false)}
      >
        {rows.length === 0 && !state.scanning && state.exhausted && (
          <p className="empty">No keys found</p>
        )}
        {rows.length > 0 && (
          <FixedSizeList
            ref={listRef}
            itemData={rowData}
            height={Math.min(Math.max(listHeight - 230, 160), rows.length * ROW_HEIGHT)}
            width="100%"
            itemCount={rows.length}
            itemSize={ROW_HEIGHT}
          >
            {TreeRow}
          </FixedSizeList>
        )}
      </div>

      <div className="key-browser-footer">
        <span className="key-count">
          {state.keyCount.toLocaleString()} keys{state.scanning ? ' — loading…' : ''}
        </span>
      </div>

      {selectMode && (
        <div className="selection-bar" role="group" aria-label="Selection">
          <span aria-live="polite">{selected.size.toLocaleString()} selected</span>
          <span className="selection-actions">
            <button
              className="btn btn-xs"
              onClick={() => setSelected(new Set(collectKeys(state.root)))}
            >
              All
            </button>
            <button className="btn btn-xs" onClick={() => setSelected(new Set())}>
              None
            </button>
            <button
              className="btn btn-xs btn-danger"
              disabled={selected.size === 0}
              onClick={() => deleteKeys([...selected], 'selected')}
            >
              Delete
            </button>
          </span>
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label:
                menu.keys.length === 1
                  ? 'Delete key'
                  : `Delete ${menu.keys.length.toLocaleString()} keys`,
              danger: true,
              onSelect: () => deleteKeys(menu.keys, menu.label)
            },
            {
              label: 'Select',
              onSelect: () => {
                setSelectMode(true)
                setSelected(new Set(menu.keys))
              }
            }
          ]}
        />
      )}
    </div>
  )
}

function SelectIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 8.2 7.1 10.3 11 5.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CaretIcon({ expanded }: { expanded: boolean }): React.JSX.Element {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 10 10"
      fill="currentColor"
      style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s ease' }}
    >
      <path d="M2.5 1l5 4-5 4z" />
    </svg>
  )
}

function FolderIcon({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg className="folder-glyph" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      {open ? (
        <path d="M1.5 4.2c0-.7.5-1.2 1.2-1.2h3.1l1.4 1.5h5.1c.7 0 1.2.5 1.2 1.2v.8H3.6a1 1 0 0 0-1 .7L1.5 10.6V4.2Zm1.6 8.8a.6.6 0 0 1-.6-.8l1.5-4.4c.1-.3.4-.5.7-.5H14.4c.4 0 .7.4.6.8l-1.5 4.4c-.1.3-.4.5-.7.5H3.1Z" />
      ) : (
        <path d="M1.5 4.2c0-.7.5-1.2 1.2-1.2h3.1l1.4 1.5h5.1c.7 0 1.2.5 1.2 1.2v6.1c0 .7-.5 1.2-1.2 1.2H2.7c-.7 0-1.2-.5-1.2-1.2V4.2Z" />
      )}
    </svg>
  )
}

function SearchIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default KeyBrowser
