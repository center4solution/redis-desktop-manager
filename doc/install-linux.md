# Installing Redis Desktop Manager on Linux

Redis Desktop Manager ships two Linux package formats: a `.deb` (Debian/Ubuntu and
derivatives) and a portable `.AppImage` (works on most distros, no install
step). Pick whichever suits your system.

## Option A — .deb package (Debian, Ubuntu, Mint, Pop!_OS, etc.)

1. Build the package (see [Building from source](#building-from-source) below)
   or obtain a pre-built `redis-desktop-manager_<version>_amd64.deb`.
2. Install it:
   ```bash
   sudo dpkg -i redis-desktop-manager_0.1.0_amd64.deb
   # If dpkg reports missing dependencies:
   sudo apt-get install -f
   ```
3. Launch it from your application menu ("Redis Desktop Manager"), or from a terminal:
   ```bash
   redis-desktop-manager
   ```

### Uninstall

```bash
sudo apt-get remove redis-desktop-manager
```

## Option B — AppImage (any distro, no install/root needed)

1. Get `Redis Desktop Manager-<version>.AppImage` (built from source, see below).
2. Make it executable and run it:
   ```bash
   chmod +x "Redis Desktop Manager-0.1.0.AppImage"
   ./"Redis Desktop Manager-0.1.0.AppImage"
   ```
3. (Optional) Integrate it into your application menu with a tool like
   [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher), or
   just keep it wherever you'd run any portable binary.

### Uninstall

Delete the `.AppImage` file. It doesn't touch the system outside your user
config directory (`~/.config/redis-desktop-manager`), which you can also remove.

## Building from source

Requirements: Node.js 18+ and npm.

```bash
git clone <this-repo-url> redis-desktop-manager
cd redis-desktop-manager
npm install
npm run package
```

Output lands in `release/`:

- `release/redis-desktop-manager_<version>_amd64.deb`
- `release/Redis Desktop Manager-<version>.AppImage`

## Running without installing (development mode)

```bash
npm install
npm run dev
```

This opens the app directly via Electron with hot reload — useful for
trying it out or developing, no packaging step required.

## Troubleshooting

- **Blank/black window on launch:** try disabling GPU acceleration:
  ```bash
  redis-desktop-manager --disable-gpu
  ```
  This is more common on Wayland sessions with certain GPU drivers; the app
  falls back fine without hardware acceleration.
- **App won't launch in a container/CI/headless environment:** Electron
  needs a display. Use `xvfb-run -a redis-desktop-manager` for headless testing.
- **`.deb` install fails on missing libraries:** run
  `sudo apt-get install -f` right after `dpkg -i` to pull in the missing
  dependencies automatically.
- **Passwords not saving correctly:** Redis Desktop Manager encrypts saved connection
  passwords using your OS keychain (via Electron's `safeStorage`, backed by
  `libsecret` on Linux). Make sure a keyring service (e.g. GNOME Keyring or
  KWallet) is running in your session — most desktop environments start one
  automatically.
