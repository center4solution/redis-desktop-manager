import { ipcMain } from 'electron'
import { connectionManager, ConnectionConfig } from '../connectionManager'
import { getProfileWithPassword } from '../configStore'

export function registerRedisHandlers(): void {
  ipcMain.handle('redis:connect', async (_evt, name: string, config: ConnectionConfig) => {
    return connectionManager.connect(name, config)
  })

  // Connect a saved profile by id: the password is read here in the main
  // process and never travels to the page.
  ipcMain.handle('redis:connectProfile', async (_evt, id: string) => {
    const profile = await getProfileWithPassword(id)
    if (!profile) throw new Error('Connection not found')
    return connectionManager.connect(profile.name, {
      host: profile.host,
      port: profile.port,
      username: profile.username || undefined,
      password: profile.password || undefined,
      db: profile.db,
      tls: profile.tls
    })
  })

  // "Test Connection" from the form. If no password was typed and the profile
  // already has one saved, test with the saved one.
  ipcMain.handle(
    'redis:test',
    async (_evt, config: ConnectionConfig, profileId?: string): Promise<void> => {
      let password = config.password
      if (!password && profileId) password = (await getProfileWithPassword(profileId))?.password
      await connectionManager.test({ ...config, password })
    }
  )

  ipcMain.handle('redis:disconnect', async (_evt, id: string) => {
    await connectionManager.disconnect(id)
  })

  ipcMain.handle('redis:list', async () => {
    return connectionManager.list()
  })

  ipcMain.handle('redis:ping', async (_evt, id: string) => {
    const client = connectionManager.getClient(id)
    return client.ping()
  })
}
