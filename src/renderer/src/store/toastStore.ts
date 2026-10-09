import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  kind: 'success' | 'error' | 'info'
}

interface ToastStore {
  toasts: Toast[]
  push: (message: string, kind?: Toast['kind']) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (rawMessage, kind = 'info') => {
    // Electron wraps IPC errors as "Error invoking remote method 'x': Error: <msg>".
    const message = rawMessage.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
