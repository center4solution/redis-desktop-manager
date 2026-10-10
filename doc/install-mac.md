# Installing Redis Desktop Manager on macOS

## Installer

1. Get the DMG for your Mac (built from source, see below):
   - Apple Silicon (M1 and later): `redis-desktop-manager-<version>-arm64.dmg`
   - Intel: `redis-desktop-manager-<version>-x64.dmg`
2. Open the DMG and drag **Redis Desktop Manager** into **Applications**.
3. Launch it from Applications or Launchpad.

The app is not notarized by Apple, so the first launch is blocked by
Gatekeeper. Try to open it once, then go to **System Settings → Privacy &
Security**, scroll down and click **Open Anyway**.

If macOS instead says the app "is damaged and can't be opened", clear the
download quarantine flag and open it again:

```bash
xattr -cr "/Applications/Redis Desktop Manager.app"
```

## Uninstalling

Drag **Redis Desktop Manager** from Applications to the Trash. Saved
connections live in `~/Library/Application Support/redis-desktop-manager`,
which you can also remove.

## Building from source

Requires Node.js and npm, and must be run on a Mac:

```bash
git clone https://github.com/center4solution/redis-desktop-manager
cd redis-desktop-manager
npm install
npm run package:mac
```

Output: `release/redis-desktop-manager-<version>-arm64.dmg` and
`release/redis-desktop-manager-<version>-x64.dmg`

If signing fails with "resource fork, Finder information, or similar detritus
not allowed", the project folder is synced by iCloud Drive (e.g. under
`~/Documents` or `~/Desktop`). Clone it somewhere that isn't synced, or build
to a different output folder:

```bash
npx electron-vite build && npx electron-builder --mac -c.directories.output=/tmp/rdm-release
```
