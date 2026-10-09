# Installing Redis Desktop Manager on Windows

## Installer

1. Get `redis-desktop-manager-setup-<version>.exe` (built from source, see below).
2. Run it. The installer lets you choose the installation directory and
   creates Desktop and Start Menu shortcuts.
3. Launch "Redis Desktop Manager" from the Start Menu or Desktop.

The installer is not code-signed, so Windows SmartScreen may warn about an
unrecognized app. Click **More info → Run anyway** to continue.

## Uninstalling

Use **Settings → Apps → Installed apps → Redis Desktop Manager → Uninstall**.
Saved connections live in `%APPDATA%\redis-desktop-manager`, which you can
also remove.

## Building from source

Requires Node.js and npm. Run from PowerShell or `cmd` (the packager needs
`powershell.exe` on `PATH`):

```powershell
git clone https://github.com/center4solution/redis-desktop-manager
cd redis-desktop-manager
npm install
npm run package:win
```

Output: `release\redis-desktop-manager-setup-<version>.exe`
