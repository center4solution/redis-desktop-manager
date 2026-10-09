# Contributing to Redis Desktop Manager

Contributions of any size are welcome: bug reports, ideas, docs and code.

## Reporting a bug or idea

Open an issue. For bugs, include your OS, the app version, your Redis version, and the steps that reproduce the problem.

## Sending a change

1. Fork the repo and create a branch from `main`.
2. `npm install`, then `npm run dev` to run the app with hot reload.
3. Keep the change focused on one thing.
4. Before opening a pull request, make sure `npm run typecheck` and `npm run build` pass.
5. Open a pull request describing what changed and why. Screenshots help for UI changes.

## Ground rules

- The renderer talks to Redis only through the typed `window.api` bridge (`src/preload`); never enable `nodeIntegration`.
- Never use `KEYS *`; scanning stays cursor-based.
- Saved passwords stay in the main process and must not be sent to the page.
- Be kind and constructive in issues and reviews.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
