# LocalTerminal

A production-grade terminal application for macOS built with Electron, `node-pty`, and `xterm.js`.

## What You Get

- Native shell sessions using your login shell (zsh, bash, fish, etc.)
- Multi-tab terminal workflow
- Persistent terminal settings (font, theme, cursor, scrollback, opacity)
- Keyboard-driven UX inspired by modern terminals (Cmd/Ctrl shortcuts)
- Native macOS menu integration
- Search inside terminal output
- Session lifecycle handling with robust PTY process management
- Packaged app builds (`dmg`/`zip`) via `electron-builder`

## Quick Start

```bash
npm install
npm run dev
```

For a production launch:

```bash
npm run start
```

To package for macOS:

```bash
npm run package:mac
```

## Key Shortcuts

- `Cmd/Ctrl+T`: new tab
- `Cmd/Ctrl+W`: close active tab
- `Cmd/Ctrl+F`: search terminal buffer
- `Cmd/Ctrl+,`: settings
- `Cmd/Ctrl+K`: clear terminal
- `Cmd/Ctrl+1..9`: jump to tab
- `Cmd/Ctrl+/-/0`: zoom terminal font in/out/reset

## Project Structure

- `src/main`: Electron main process, IPC, PTY orchestration
- `src/preload`: secure context bridge API
- `src/renderer`: terminal UI and interaction logic
- `src/shared`: shared type contracts between processes

## Notes

- The PTY backend is `node-pty`, so native build tooling is required during `npm install`.
- Settings and window state are stored in Electron user data (`~/Library/Application Support/LocalTerminal` on macOS).
