# Releasing BasedShell

This runbook defines the production release process for macOS builds.

## Scope

- Runtime: Electron desktop app (`BasedShell`)
- Packaging: `electron-builder`
- Artifacts: `dmg`, `zip` in `release/`
- Update path: GitHub Releases + `electron-updater`

## One-Time Setup

1. Apple Developer account with Developer ID Application certificate.
2. GitHub repository secrets configured:
   - `CSC_LINK`
   - `CSC_KEY_PASSWORD`
   - `APPLE_ID`
   - `APPLE_APP_SPECIFIC_PASSWORD`
   - `APPLE_TEAM_ID`
3. Verify `electron-builder.yml` publish target points to:
   - `owner: XtraSaltyDev`
   - `repo: BasedShell`

For unsigned community releases, Apple Developer setup is optional. Signed releases require all Apple/certificate secrets.

## Pre-Release Checks

1. Sync dependencies and lockfile:
   - `npm install`
   - Commit `package-lock.json` updates if changed.
2. Run quality gates:
   - `npm run typecheck`
   - `npm run build`
3. Run startup regression checklist:
   - `docs/startup-regression-checklist.md`
4. Confirm updater plumbing from app UI:
   - Command palette: `Check for Updates`
   - Command palette: `Install Downloaded Update` / `Restart to Apply Update`

## Create a Release

Preferred path: push a version tag to trigger CI workflow.

1. Ensure `package.json` version is correct.
2. Create tag:
   - Stable: `v1.0.1`
   - Beta/pre: `v1.1.0-beta.1`
3. Push tag:
   - `git push origin v1.0.1`
4. Workflow file:
   - `.github/workflows/release-macos.yml`

## Manual Workflow Dispatch

You can run the same workflow manually from GitHub Actions.

- Inputs:
  - `publish`: `true` or `false`
  - `channel`: `latest` or `beta`
  - `signing`: `unsigned` or `signed`

Use `publish=false` for dry-run packaging without release publishing.
Use `signing=unsigned` for releases that do not require Apple signing/notarization.

## Post-Release Validation

Validate notarization and launch behavior on a clean machine:

1. Install the generated `.dmg`.
2. For unsigned builds, clear quarantine before first launch if needed:
   - `sudo xattr -dr com.apple.quarantine /Applications/BasedShell.app`
   - `open /Applications/BasedShell.app`
3. Verify Gatekeeper acceptance:
   - `spctl -a -vv /Applications/BasedShell.app`
4. Verify notarization staple:
   - `xcrun stapler validate /Applications/BasedShell.app`
5. Launch app and smoke check:
   - Open tab, split pane, open settings, switch theme, run command.
6. Check in-app update signal on previous release build.

For unsigned builds, `spctl` and `stapler` checks are expected to fail trust/notarization and should be treated as informational.

## Rollback / Hotfix

1. If release is broken, remove or mark release as pre-release on GitHub.
2. Cut hotfix branch, patch, and tag next version.
3. Publish hotfix with same workflow.

## Notes

- `release-macos.yml` supports both signed and unsigned releases.
- Unsigned mode uses `CSC_IDENTITY_AUTO_DISCOVERY=false` to force non-signed packaging.
- For signed mode, missing Apple/certificate secrets will fail validation.
- `release-macos.yml` currently uses `npm install` (not `npm ci`) to avoid lockfile drift failures until lockfile is consistently committed.
- Keep secrets only in GitHub Actions secrets; never store them in repo files.
