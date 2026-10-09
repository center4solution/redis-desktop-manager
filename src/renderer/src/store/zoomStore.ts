import { create } from 'zustand'

// UI zoom for all text/content, applied through Electron's webFrame so the
// whole layout (including viewport-height panels) scales consistently.
export const ZOOM_MIN = 0.6
export const ZOOM_MAX = 2
const ZOOM_STEP = 0.1
const STORAGE_KEY = 'rdm.zoom'

const clamp = (n: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n * 100) / 100))

function readStored(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY))
    return n >= ZOOM_MIN && n <= ZOOM_MAX ? n : 1
  } catch {
    return 1
  }
}

interface ZoomStore {
  zoom: number
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
}

function apply(zoom: number): void {
  window.api.zoom.set(zoom)
  try {
    localStorage.setItem(STORAGE_KEY, String(zoom))
  } catch {
    // ignore — per-viewer convenience only
  }
}

export const useZoomStore = create<ZoomStore>((set, get) => {
  const update = (next: number): void => {
    const zoom = clamp(next)
    apply(zoom)
    set({ zoom })
  }
  return {
    zoom: readStored(),
    zoomIn: () => update(get().zoom + ZOOM_STEP),
    zoomOut: () => update(get().zoom - ZOOM_STEP),
    reset: () => update(1)
  }
})
