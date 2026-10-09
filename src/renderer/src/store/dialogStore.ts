import { create } from 'zustand'

// Electron's renderer does not implement window.prompt() at all (it throws
// "prompt() is not supported"), and window.confirm() is inconsistent across
// platforms/versions — so every "ask the user a quick question" flow in this
// app goes through this in-app dialog instead of the browser APIs.

// `id` is unique per request so the UI can mount a fresh dialog for each one.
export type DialogRequest =
  | { id: number; opener: HTMLElement | null; kind: 'confirm'; message: string; resolve: (ok: boolean) => void }
  | {
      id: number
      opener: HTMLElement | null // what had focus when asked, so it can get focus back
      kind: 'prompt'
      message: string
      defaultValue: string
      resolve: (value: string | null) => void
    }

let nextId = 0
const activeElement = (): HTMLElement | null => document.activeElement as HTMLElement | null

interface DialogStore {
  current: DialogRequest | null
  confirm: (message: string) => Promise<boolean>
  prompt: (message: string, defaultValue?: string) => Promise<string | null>
  submit: (value: string | boolean) => void
  cancel: () => void
}

export const useDialogStore = create<DialogStore>((set, get) => ({
  current: null,

  confirm: (message) =>
    new Promise<boolean>((resolve) => {
      set({ current: { id: ++nextId, opener: activeElement(), kind: 'confirm', message, resolve } })
    }),

  prompt: (message, defaultValue = '') =>
    new Promise<string | null>((resolve) => {
      set({
        current: { id: ++nextId, opener: activeElement(), kind: 'prompt', message, defaultValue, resolve }
      })
    }),

  submit: (value) => {
    const current = get().current
    if (!current) return
    if (current.kind === 'confirm') current.resolve(Boolean(value))
    else current.resolve(typeof value === 'string' ? value : null)
    set({ current: null })
  },

  cancel: () => {
    const current = get().current
    if (!current) return
    if (current.kind === 'confirm') current.resolve(false)
    else current.resolve(null)
    set({ current: null })
  }
}))
