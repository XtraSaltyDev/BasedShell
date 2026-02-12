# BasedShell

BasedShell is a production-grade macOS terminal app built with Electron, `node-pty`, and `xterm.js`.

## Current Features

- Native PTY shell sessions using your login shell
- Multi-tab terminal workflow with keyboard-first controls
- Reconciled tab strip with smooth enter/exit transitions
- Tab activity states:
  - Active output pulse
  - Unread output indicator on background tabs
  - Exited tab state indicator
- Overflow-aware tab strip with dynamic tab width compression
- Persistent settings (font, cursor, scrollback, opacity, theme, vibrancy)
- Full UI + terminal theme architecture with built-in themes:
  - `graphite`, `midnight`, `solarized-dark`, `paper`, `aurora`, `noir`, `fog`
  - `system` theme selection support
- System appearance integration (`dark`/`light` updates)
- Optional macOS vibrancy mode
- Search in terminal output
- Native app menu and standard terminal shortcuts
- SVG icon system for terminal chrome controls
- Packaged macOS builds (`dmg`/`zip`) via `electron-builder`

## Quick Start

```bash
npm install
npm run dev
```

Production run:

```bash
npm run start
```

Build distributables:

```bash
npm run package:mac
```

## Key Shortcuts

- `Cmd/Ctrl+T`: new tab
- `Cmd/Ctrl+W`: close active tab
- `Cmd/Ctrl+F`: find in terminal
- `Cmd/Ctrl+,`: open settings
- `Cmd/Ctrl+K`: clear terminal
- `Cmd/Ctrl+1..9`: jump to tab
- `Cmd/Ctrl+/-/0`: terminal font zoom in/out/reset

## Project Structure

- `src/main`: Electron main process, IPC, window lifecycle, PTY orchestration
- `src/preload`: secure renderer bridge API
- `src/renderer`: UI, tab lifecycle, terminal interactions, themes, icons
- `src/shared`: cross-process type and theme metadata contracts

## Notes

- `node-pty` requires native tooling during install.
- `postinstall` runs `scripts/fix-node-pty-helper.mjs` to ensure `spawn-helper` is executable on macOS.
- Runtime settings and window state are stored under Electron user data (typically `~/Library/Application Support/BasedShell` on macOS).
