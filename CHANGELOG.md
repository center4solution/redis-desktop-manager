# Changelog

## 0.2.0

- **Renamed to Redis Desktop Manager** — new product name, package name (`redis-desktop-manager`) and app ID (`com.center4solution.redis-desktop-manager`). Linux users with the old `rdm-desktop` package should remove it first (`sudo apt remove rdm-desktop`).
- **Windows installer** — 64-bit NSIS installer (`redis-desktop-manager-setup-<version>.exe`) with a choice of install folder plus Desktop and Start Menu shortcuts. See [doc/install-windows.md](doc/install-windows.md).
- **Connection URL option** — the connection form can take a `redis://` or `rediss://` URL (user, password, host, port, db, TLS) instead of separate fields.
- New `package:win` and `package:linux` scripts.

## 0.1.0 — initial build-out

All 12 planned steps for the first working version, in order:

1. **Project skeleton** — electron-vite + React + TypeScript, builds and type-checks clean on all three targets.
2. **Secure IPC bridge** — `contextIsolation`, no `nodeIntegration`, a single typed `window.api` surface.
3. **Redis connection manager** — `ioredis`-backed, main-process-owned, fail-fast retry strategy.
4. **Connection UI** — sidebar with status dots, add/edit/delete modal, per-connection connect/disconnect.
5. **Credential persistence** — profiles in `connections.json` under `userData`; passwords encrypted at rest via Electron's `safeStorage` (OS keychain/DPAPI/libsecret).
6. **Key browser** — `SCAN`-based (never `KEYS *`), namespace tree grouped on `:`, virtualized list, type badges, pagination.
7. **Value viewer** — type-aware read views for string/hash/list/set/zset/stream, TTL display, large-collection truncation.
8. **Value editing** — per-type mutations, rename, TTL set/clear, duplicate, delete.
9. **CLI console** — raw command execution with quote-aware tokenizing, scrollback, history (↑/↓).
10. **Polish** — dark/light theming, toast notifications, server stats + DB switcher, keyboard shortcuts (Esc, Ctrl/Cmd+K).
11. **Packaging** — electron-builder configs for Linux (AppImage/deb — built and verified), Windows (NSIS), macOS (dmg).
12. **Auto-update** — `electron-updater` wired to GitHub Releases (disabled by default; see `electron-builder.yml`), in-app update banner.

### Known gaps (deliberately out of scope for v1)

- No cluster/Sentinel support
- No SSH tunneling
- No pub/sub monitor or slow-log viewer
- No memory analysis tooling
- No bulk import/export
- Large collections (>500 items) truncate in the value viewer rather than paginating
- Not code-signed (fine for personal/internal use; needed for public distribution)
