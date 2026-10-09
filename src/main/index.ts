import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerRedisHandlers } from './ipc/redisHandlers'
import { registerConfigHandlers } from './ipc/configHandlers'
import { registerKeyHandlers } from './ipc/keyHandlers'
import { registerValueHandlers } from './ipc/valueHandlers'
import { registerValueEditHandlers } from './ipc/valueEditHandlers'
import { registerCliHandlers } from './ipc/cliHandlers'
import { registerServerHandlers } from './ipc/serverHandlers'
import { connectionManager } from './connectionManager'
import icon from '../../resources/icon.png?asset'
import { setupAutoUpdater, downloadUpdate, quitAndInstall } from './updater'

let mainWindowRef: BrowserWindow | null = null

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindowRef = mainWindow
  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) mainWindowRef = null
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Only ever hand real web links to the OS; other schemes (file:, custom
  // protocol handlers, …) must not be launchable from page content.
  const isWebUrl = (raw: string): boolean => {
    try {
      const { protocol } = new URL(raw)
      return protocol === 'https:' || protocol === 'http:'
    } catch {
      return false
    }
  }
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isWebUrl(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })
  // The app is a single page: never let the window navigate away from it.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      if (isWebUrl(url)) shell.openExternal(url)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Electron's default menu binds Ctrl/Cmd +/-/0 to its own zoom, which fights
// the app's zoom setting (the renderer handles those shortcuts itself). Use a
// menu with the standard Edit/View items minus the zoom roles.
function buildMenu(): Menu {
  const isMac = process.platform === 'darwin'
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' as const },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    },
    { role: 'windowMenu' as const }
  ])
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.rdm.desktop')
  Menu.setApplicationMenu(buildMenu())

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window, { zoom: true })
  })

  // Step 2: basic ping/pong IPC round-trip check
  ipcMain.handle('app:ping', () => 'pong')

  // Step 3: Redis connection manager IPC handlers
  registerRedisHandlers()

  // Step 5: persisted connection profiles (JSON + OS-keychain-backed passwords)
  registerConfigHandlers()

  // Step 6: SCAN-based key browser
  registerKeyHandlers()

  // Step 7: type-aware value viewer
  registerValueHandlers()

  // Step 8: value editing (per-type mutations, rename/TTL/duplicate)
  registerValueEditHandlers()

  // Step 9: CLI console
  registerCliHandlers()

  // Step 10: server stats + DB switcher
  registerServerHandlers()

  // Step 12: auto-update
  ipcMain.handle('app:downloadUpdate', () => downloadUpdate())
  ipcMain.handle('app:quitAndInstall', () => quitAndInstall())
  ipcMain.handle('app:version', () => app.getVersion())

  connectionManager.onStatus((event) => {
    mainWindowRef?.webContents.send('redis:statusEvent', event)
  })

  createWindow()
  setupAutoUpdater(() => mainWindowRef)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Close Redis connections first, then quit through the normal path (not
// app.exit()) so quit-time hooks such as the auto-updater's installer still run.
let connectionsClosed = false
app.on('before-quit', (event) => {
  if (connectionsClosed) return
  event.preventDefault()
  connectionsClosed = true
  connectionManager
    .disconnectAll()
    .catch(() => {})
    .finally(() => app.quit())
})
