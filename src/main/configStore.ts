import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile, mkdir, rename, copyFile, chmod } from 'node:fs/promises'

export interface StoredProfile {
  id: string
  name: string
  host: string
  port: number
  username?: string
  db?: number
  tls?: boolean
  icon?: string // small data-URL image shown next to the connection
  // Password is encrypted at rest via safeStorage (OS keychain/DPAPI/libsecret),
  // stored as a base64 string. Never written to disk in plaintext.
  encryptedPassword?: string
}

// What the renderer sees: never the password itself, only whether one is saved.
export type PublicProfile = Omit<StoredProfile, 'encryptedPassword'> & { hasPassword: boolean }

// What the renderer may send when saving. `password` sets a new one; leaving it
// out keeps the saved one; `clearPassword` removes it.
export type SaveProfileInput = Omit<StoredProfile, 'encryptedPassword'> & {
  password?: string
  clearPassword?: boolean
}

export interface ProfileWithPassword extends Omit<StoredProfile, 'encryptedPassword'> {
  password?: string
}

const configPath = (): string => join(app.getPath('userData'), 'connections.json')

async function readAll(): Promise<StoredProfile[]> {
  let raw: string
  try {
    raw = await readFile(configPath(), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('connections.json is not a list')
    return parsed as StoredProfile[]
  } catch {
    // Corrupt file: keep a copy for recovery and start clean, rather than
    // failing every load and every later save.
    await copyFile(configPath(), `${configPath()}.corrupt-${Date.now()}`).catch(() => {})
    return []
  }
}

// Write to a temp file then rename: a crash mid-write can never leave a
// half-written connections.json. Mode 0600 — it holds hosts and (encrypted)
// passwords, so other users on the machine shouldn't be able to read it.
async function writeAll(profiles: StoredProfile[]): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  const target = configPath()
  const tmp = `${target}.tmp`
  await writeFile(tmp, JSON.stringify(profiles, null, 2), { encoding: 'utf-8', mode: 0o600 })
  await rename(tmp, target)
  await chmod(target, 0o600).catch(() => {})
}

function encryptPassword(password: string | undefined): string | undefined {
  if (!password) return undefined
  if (!safeStorage.isEncryptionAvailable()) {
    // Fall back to plaintext only if the OS has no keychain backend available
    // (e.g. some minimal Linux setups without libsecret). Still base64-wrapped
    // so the storage format stays uniform; not a security boundary in that case.
    return Buffer.from(password, 'utf-8').toString('base64')
  }
  return safeStorage.encryptString(password).toString('base64')
}

function decryptPassword(encrypted: string | undefined): string | undefined {
  if (!encrypted) return undefined
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, 'base64').toString('utf-8')
    }
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return undefined
  }
}

export async function listProfiles(): Promise<PublicProfile[]> {
  const stored = await readAll()
  return stored.map(({ encryptedPassword, ...rest }) => ({
    ...rest,
    hasPassword: Boolean(encryptedPassword)
  }))
}

/** Main-process only: the profile with its decrypted password, for connecting. */
export async function getProfileWithPassword(id: string): Promise<ProfileWithPassword | undefined> {
  const stored = await readAll()
  const found = stored.find((p) => p.id === id)
  if (!found) return undefined
  const { encryptedPassword, ...rest } = found
  return { ...rest, password: decryptPassword(encryptedPassword) }
}

export async function saveProfile(input: SaveProfileInput): Promise<void> {
  const stored = await readAll()
  const { password, clearPassword, ...rest } = input
  const idx = stored.findIndex((p) => p.id === input.id)
  const existing = idx >= 0 ? stored[idx] : undefined

  let encryptedPassword = existing?.encryptedPassword
  if (clearPassword) encryptedPassword = undefined
  if (password) encryptedPassword = encryptPassword(password)

  const entry: StoredProfile = { ...rest, encryptedPassword }
  if (idx >= 0) {
    stored[idx] = entry
  } else {
    stored.push(entry)
  }
  await writeAll(stored)
}

/**
 * Whether saved passwords get real OS-keychain protection. On Linux without a
 * keyring (libsecret/kwallet), Electron falls back to a hard-coded key
 * ("basic_text"), which only obscures the password — the UI warns about that.
 */
export function getStorageSecurity(): { secure: boolean; reason?: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    return { secure: false, reason: 'No OS keychain is available' }
  }
  const backend =
    typeof safeStorage.getSelectedStorageBackend === 'function'
      ? safeStorage.getSelectedStorageBackend()
      : undefined
  if (backend === 'basic_text' || backend === 'unknown') {
    return { secure: false, reason: 'No system keyring found (weak fallback encryption)' }
  }
  return { secure: true }
}

export async function deleteProfile(id: string): Promise<void> {
  const stored = await readAll()
  await writeAll(stored.filter((p) => p.id !== id))
}
