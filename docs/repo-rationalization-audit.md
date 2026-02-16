# Repo Rationalization Audit

Date: 2026-02-13  
Scope: evaluate whether `basedshell-glass/` should remain in the main app repo.

## Findings

1. `basedshell-glass/` is a nested, parallel app copy:
   - includes its own `package.json`, `tsconfig`, `vite.config`, `scripts`, `src`, and `test`.
2. It is not referenced by the root runtime build path:
   - no imports/usages found from root app code.
3. It duplicates core source structure:
   - 22 overlapping `src/**` paths with root app (same relative file names).
4. Tracked Git footprint:
   - 34 tracked files under `basedshell-glass/**`.
5. Local disk impact is significant:
   - `basedshell-glass/` is ~`1.0G` locally (mostly local `node_modules`/`dist`; not tracked).

## Risk Assessment

- Maintenance risk: high
  - parallel source trees can drift and cause confusion about source-of-truth.
- Runtime risk: low (today)
  - currently appears unused by root app runtime.
- Collaboration risk: medium-high
  - new contributors can modify the wrong tree.

## Recommendation

Recommendation: **remove `basedshell-glass/` from this repo** unless there is a confirmed product need for a second independently shipped app.

Rationale:
- no active references from root app,
- duplicated architecture and configs,
- avoid split-brain maintenance.

## Safe Execution Plan

1. Confirm ownership intent:
   - keep only if there is a planned separate release process.
2. If removal is approved:
   - delete tracked `basedshell-glass/**`,
   - add a short migration note in `README.md` or `docs/` if needed.
3. Run validation:
   - `npm run typecheck`
   - `npm run build`
4. Final sanity:
   - verify no `basedshell-glass` references remain.

## Alternative (if keep is intentional)

If it must remain:
- move it into a clearly named workspace boundary (e.g. `experiments/` or `packages/`),
- add top-level documentation on ownership and release status,
- enforce explicit CI scope separation.
