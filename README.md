# RDM Desktop

Cross-platform Redis Desktop Manager (Linux, Windows, macOS) — built with Electron + React + TypeScript (electron-vite).

## Status

**v0.1.0 — all 12 build-out steps complete.** See [CHANGELOG.md](CHANGELOG.md) for what's in and what's deliberately out of scope.

## Features

- Multiple named connection profiles, encrypted-at-rest passwords (OS keychain via Electron `safeStorage`)
- `SCAN`-based key browser with a `:`-namespace tree, type badges, and pagination (no `KEYS *`, ever)
- Type-aware value viewer/editor: string, hash, list, set, zset, stream — with TTL, rename, duplicate, delete
- Raw CLI console with command history
- DB switcher + live server stats (version, DBSIZE, memory, clients)
- Dark/light theme, toast notifications, keyboard shortcuts (`Esc` closes modals, `Ctrl/Cmd+K` focuses the CLI)
- Auto-update support via `electron-updater` (disabled until a maintainer configures a publish target)

## Requirements

- Node.js 18+ (developed against Node 24)
- A desktop/GUI environment to run the Electron window

## Development

```bash
npm install
npm run dev          # start Electron in dev mode with HMR
npm run typecheck    # type-check main/preload and renderer
npm run build         # production build (out/)
```

## Packaging

```bash
npm run package
```

Builds and packages for whatever platform you run it on: AppImage + deb on Linux, NSIS on Windows, dmg on macOS (targets are configured in `electron-builder.yml`). Run it natively on each platform — there's no cross-compiling from Linux to Windows/macOS here.

Packaged apps land in `release/`. Linux packaging (AppImage + deb) has been built and verified in this project's dev environment; Windows and macOS builds should be run on their respective platforms.

For end-user install steps (not building from source), see [doc/install-linux.md](doc/install-linux.md).

### Auto-update

`electron-builder.yml` ships with `publish: null` — auto-update checks silently no-op until you configure a real publish target (GitHub Releases is set up as a commented example). To enable:

1. Uncomment the `publish:` block in `electron-builder.yml` and set your `owner`/`repo`.
2. Run a release build with `GH_TOKEN` set: `electron-builder --publish always`.
3. Subsequent installs will check that feed on startup and show an in-app update banner.

## Structure

```
src/
  main/       # Electron main process — owns Redis connections, all IPC handlers, config/credential storage, auto-updater
  preload/    # contextBridge — the only surface exposed to the renderer (window.api)
  renderer/   # React UI (Zustand stores, components)
build/        # app icon
electron-builder.yml
```

## Security notes

- `contextIsolation: true`, `nodeIntegration: false` everywhere — the renderer only ever talks to Redis through the typed `window.api` bridge, never directly.
- Passwords are encrypted via Electron's `safeStorage` before touching disk (falls back to a clearly-marked non-secure encoding only if a Linux host has no keychain backend at all).
- The key browser and CLI never issue `KEYS *`; scanning is cursor-based throughout.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
