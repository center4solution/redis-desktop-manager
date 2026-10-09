import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

// Right-click / Shift+F10 menu with real menu semantics: it takes focus when it
// opens, Up/Down/Home/End move between items, Enter or Space picks one, and
// Escape, Tab or clicking elsewhere closes it (focus goes back where it was).
function ContextMenu({ x, y, items, onClose }: Props): React.JSX.Element {
  const listRef = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Keep the menu fully on screen.
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - height - 4))
    })
  }, [x, y, items.length])

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const close = (): void => onClose()
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const move = (delta: number | 'first' | 'last'): void => {
    const nodes = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    if (nodes.length === 0) return
    const current = nodes.indexOf(document.activeElement as HTMLElement)
    const next =
      delta === 'first'
        ? 0
        : delta === 'last'
          ? nodes.length - 1
          : (current + delta + nodes.length) % nodes.length
    nodes[next].focus()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(-1)
        break
      case 'Home':
        e.preventDefault()
        move('first')
        break
      case 'End':
        e.preventDefault()
        move('last')
        break
      case 'Escape':
      case 'Tab':
        e.preventDefault()
        onClose()
        break
    }
  }

  return (
    <ul
      ref={listRef}
      className="context-menu"
      role="menu"
      style={pos}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <li
          key={item.label}
          role="menuitem"
          tabIndex={-1}
          className={item.danger ? 'danger' : undefined}
          onClick={() => {
            onClose()
            item.onSelect()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onClose()
              item.onSelect()
            }
          }}
        >
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export default ContextMenu
