import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keyboard behaviour every modal dialog needs: focus moves into the dialog when
 * it opens (unless something inside already grabbed it via autoFocus), Tab and
 * Shift+Tab wrap inside it, Escape closes it, and focus returns to whatever
 * had it before the dialog opened.
 */
export function useFocusTrap<T extends HTMLElement>(
  onClose: () => void,
  // The element to give focus back to. Pass it when something inside the dialog
  // uses autoFocus: that has already moved focus by the time this effect runs,
  // so "whatever was focused" would be the dialog's own button.
  returnFocusTo?: HTMLElement | null
): React.RefObject<T | null> {
  const ref = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const previouslyFocused = returnFocusTo ?? (document.activeElement as HTMLElement | null)

    if (!root.contains(document.activeElement)) {
      const first = root.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? root).focus()
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    root.addEventListener('keydown', onKeyDown)
    return () => {
      root.removeEventListener('keydown', onKeyDown)
      // Return focus to the control that opened the dialog, if it still exists.
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [])

  return ref
}
