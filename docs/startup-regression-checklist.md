# Startup Regression Checklist

Use this checklist after changes that affect startup, shell sessions, settings, or dev orchestration.

## Prerequisites

1. Install dependencies:
   - `npm install`
2. Ensure no stale dev processes are running.

## Dev Startup

1. Run:
   - `npm run dev:preflight`
2. Expect:
   - Exit code `0` when port `5173` is available.
   - Clear fail-fast message if port `5173` is occupied.
3. Run:
   - `npm run dev`
4. Expect:
   - Renderer serves on `http://localhost:5173`
   - Electron launches without waiting on the wrong port.

## First Session Startup

1. Launch app (`npm run start` or packaged app).
2. Validate first tab immediately after launch:
   - No `Restored session:` banner appears.
   - Session starts at home directory (`~`) by default.

## Prompt Style Setting

1. Open Settings.
2. Set `Prompt Style` to `System`, save, then fully relaunch app.
3. Validate first tab:
   - Shell prompt follows normal shell/system behavior.
4. Set `Prompt Style` to `Minimal (❯)`, save, then fully relaunch app.
5. Validate first tab and a newly created tab:
   - Prompt is minimal `❯`.
   - No `user@host` prefix is shown.

## Smoke Validation

1. Run:
   - `npm run typecheck`
   - `npm run build`
2. Expect:
   - Both commands pass without errors.

## Notes

- Prompt style changes apply per new shell session. Existing open tabs keep current prompt until reopened.
- If prompt behavior seems stale, fully quit and relaunch the app before retesting.
