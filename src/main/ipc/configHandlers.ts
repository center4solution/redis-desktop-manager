import { ipcMain } from 'electron'
import {
  listProfiles,
  saveProfile,
  deleteProfile,
  getStorageSecurity,
  SaveProfileInput
} from '../configStore'

export function registerConfigHandlers(): void {
  // Profiles come back without passwords (hasPassword only); the password
  // stays in the main process and is used there when connecting.
  ipcMain.handle('config:listProfiles', async () => {
    return listProfiles()
  })

  ipcMain.handle('config:saveProfile', async (_evt, profile: SaveProfileInput) => {
    await saveProfile(profile)
  })

  ipcMain.handle('config:deleteProfile', async (_evt, id: string) => {
    await deleteProfile(id)
  })

  ipcMain.handle('config:storageSecurity', () => getStorageSecurity())
}
