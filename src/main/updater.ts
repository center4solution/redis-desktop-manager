import { app, BrowserWindow } from 'electron'
// electron-updater is CommonJS; a named import doesn't interop reliably
// once electron-vite externalizes it in this ESM project, so pull the
// default export and destructure instead.
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'downloading'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

/**
 * Wires electron-updater to check GitHub Releases for new versions.
 * Only runs against a packaged build — dev/unpackaged runs always report
 * "not-available" immediately since there is nothing meaningful to check.
 *
 * Publishing is not configured here (electron-builder.yml has `publish: null`);
 * a maintainer enables it by setting a `publish` provider (e.g. GitHub) and
 * running a release build with `--publish always`.
 */
export function setupAutoUpdater(getWindow: () => BrowserWindow | null): void {
  const notify = (event: UpdateEvent): void => {
    getWindow()?.webContents.send('app:updateEvent', event)
  }

  if (!app.isPackaged) {
    // Dev builds have no update feed — skip wiring entirely.
    return
  }

  autoUpdater.autoDownload = false

  autoUpdater.on('checking-for-update', () => notify({ type: 'checking' }))
  autoUpdater.on('update-available', (info) => notify({ type: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => notify({ type: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    notify({ type: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => notify({ type: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) => notify({ type: 'error', message: err.message }))

  // Check once on startup; a real release cadence might also poll periodically.
  autoUpdater.checkForUpdates().catch((err) => notify({ type: 'error', message: err.message }))
}

export function downloadUpdate(): Promise<void> {
  return autoUpdater.downloadUpdate().then(() => undefined)
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
