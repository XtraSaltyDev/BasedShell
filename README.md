# BasedShell ⚡🖥️

![Platform](https://img.shields.io/badge/Platform-macOS-black?logo=apple)
![Stack](https://img.shields.io/badge/Stack-Electron%20%2B%20xterm.js-1f2937)
![Build](https://img.shields.io/badge/Build-passing-16a34a)
![License](https://img.shields.io/badge/License-MIT-2563eb)

A modern, production-grade macOS terminal focused on speed, clarity, and keyboard-first workflows.

BasedShell is built with Electron, `node-pty`, and `xterm.js`, and now includes workspace-aware productivity features inspired by leading custom terminal apps.

## ✨ Highlights

- Real PTY shell sessions using your login shell
- Multi-tab workflow with smooth enter/exit reconciliation
- Repo/branch-aware tab titles (with SSH context support)
- Interactive productivity status bar:
  - Shell/Process
  - Working Directory
  - Git branch + dirty state
  - Active Workspace
  - Last exit code + duration
  - Tab count and Theme
- Command Palette (`Cmd/Ctrl+Shift+P`) with:
  - Fuzzy search
  - Keyboard navigation
  - Recent actions
  - Pin favorites
- Search redesign (inline topbar search):
  - Match counter (`current/total`)
  - Case-sensitive + regex toggles
  - Next/prev navigation
  - Keyboard navigation shortcuts
- Workspaces + Profile Cards:
  - Named workspace presets
  - Startup tab definitions
  - Save current tabs into workspace startup config
  - Per-card shell profile + visual overrides
- Theme architecture with built-in themes:
  - `graphite`, `midnight`, `solarized-dark`, `paper`, `aurora`, `noir`, `fog`, and `system`
- System appearance sync (`light`/`dark`) + optional macOS vibrancy
- Toast notifications + native menu integration

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Run production build locally:

```bash
npm run start
```

Package macOS distributables (`dmg` + `zip`):

```bash
npm run package:mac
```

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| New tab | `Cmd/Ctrl+T` |
| Close tab | `Cmd/Ctrl+W` |
| Open search | `Cmd/Ctrl+F` |
| Next search match | `Cmd/Ctrl+G` / `F3` / `Enter` (in search input) |
| Previous search match | `Cmd/Ctrl+Shift+G` / `Shift+F3` / `Shift+Enter` |
| Open settings | `Cmd/Ctrl+,` |
| Open command palette | `Cmd/Ctrl+Shift+P` |
| Clear terminal | `Cmd/Ctrl+K` |
| Jump to tab 1-9 | `Cmd/Ctrl+1..9` |
| Font zoom in/out/reset | `Cmd/Ctrl+Plus`, `Cmd/Ctrl+-`, `Cmd/Ctrl+0` |

## 🧠 Workspace + Profile Card Model

- A **Workspace** defines named startup tabs and default card behavior.
- A **Profile Card** maps to a shell profile and optional visual overrides (theme/font/cursor/padding).
- You can:
  - switch workspaces from status bar + command palette
  - capture current tabs into workspace startup tabs
  - create/edit/delete workspaces and cards from Settings

## 🎨 UI + Theme System

- Shared, typed theme contracts across main/renderer
- ANSI terminal theme + chrome token system
- Dynamic CSS variable application
- Vibrancy-aware surface styling for macOS

## 🏗️ Project Structure

- `src/main` - Electron main process, IPC, menu, PTY orchestration, settings persistence
- `src/preload` - secure renderer bridge (`window.terminalAPI`)
- `src/renderer` - tabs, command palette, search, settings UI, workspaces, profile cards
- `src/shared` - cross-process types + theme metadata

## 📦 Runtime Notes

- `node-pty` requires native tooling during install.
- `postinstall` runs `scripts/fix-node-pty-helper.mjs` to ensure `spawn-helper` is executable on macOS.
- Settings and window state persist under Electron user data.
  - Typical macOS path: `~/Library/Application Support/BasedShell`

## 🛠️ Troubleshooting

- If `nvm` complains about `npm_config_prefix`, run:

```bash
unset npm_config_prefix
```

- If `rg` (ripgrep) is missing:

```bash
brew install ripgrep
```

## 📄 License

MIT
