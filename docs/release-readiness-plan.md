# Release Readiness Plan

This plan captures the minimum production release path for BasedShell on macOS using the current build tooling (`electron-builder`).

## Current Baseline

- App ID: `com.basedshell.app`
- Product name: `BasedShell`
- Packaging targets: `dmg`, `zip`
- Build command: `npm run package:mac`
- Output directory: `release/`

## 1) Code Signing + Notarization

### Required Apple setup

- Apple Developer Program team membership
- Developer ID Application certificate installed in keychain
- App-specific password for notarization (or API key flow)

### Environment variables (CI/local release)

- `CSC_NAME`
  - Signing identity label, example: `Developer ID Application: Your Name (TEAMID)`
- `APPLE_ID`
  - Apple ID used for notarization
- `APPLE_APP_SPECIFIC_PASSWORD`
  - App-specific password for notarization account
- `APPLE_TEAM_ID`
  - Team ID for notarization context

Note: Keep these in CI secret storage. Never commit them.

### Builder config to add/verify

`electron-builder.yml` should explicitly include notarization intent for macOS builds:

- `mac.hardenedRuntime: true`
- `mac.gatekeeperAssess: false`
- `mac.entitlements` and `mac.entitlementsInherit` (if needed by runtime behavior)

If the app is distributed outside the App Store, ensure hardened runtime is enabled before notarization.

## 2) Auto-Update Strategy

### Recommendation

Adopt `electron-updater` with GitHub Releases provider as the initial channel because the repository is already GitHub-hosted.

### Minimal rollout model

- Channel 1: `beta` prereleases for smoke validation
- Channel 2: `latest` stable releases for general users

### Required implementation areas

- Main process update service (`checkForUpdates`, progress, error, downloaded events)
- Renderer-facing status/toast hooks for update lifecycle
- “Restart to update” action after download
- Optional settings toggle for automatic update checks

## 3) CI/CD Release Pipeline

### Suggested pipeline stages

1. Install dependencies (`npm ci`)
2. Typecheck (`npm run typecheck`)
3. Build (`npm run build`)
4. Package (`npm run package:mac`)
5. Sign + notarize (during package)
6. Publish artifacts and release notes

### Artifact validation

- Verify generated DMG mounts and installs correctly
- Verify ZIP launches cleanly
- Verify app signature and notarization ticket

## 4) Release Quality Gate

Run before each tagged release:

- Startup regression checklist (`docs/startup-regression-checklist.md`)
- Split pane keyboard/mouse interactions
- Settings window open/save/reset/close behavior
- Theme switching (including Catppuccin flavors)
- Prompt style setting for newly created sessions
- Command palette actions and search behavior

## 5) User Upgrade Path

For users who installed manually:

- If auto-update is not enabled yet, document manual update steps in README:
  1. Download latest DMG from Releases
  2. Quit BasedShell
  3. Replace app in `/Applications`
  4. Reopen app (settings/session data remain in app support directory)

For users after updater rollout:

- In-app update checks should detect and guide install/restart flow.

## 6) Immediate Next Tasks (Execution Order)

1. Add hardened runtime + notarization-oriented keys to `electron-builder.yml`.
2. Implement main-process update service abstraction and renderer notifications.
3. Add settings option for update channel/check frequency (optional but recommended).
4. Create release workflow in CI with signing/notarization secrets.
5. Add a short `RELEASING.md` runbook for maintainers.

