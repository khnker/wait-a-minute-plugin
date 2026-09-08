# Proposal: approve-contract-default-allowed-actions

## Why
`approveContract()` persists `allowedActions` with a limited set: read, search, inspect, test, lint, typecheck, install dependency, install browser binary, run validation, modify source, create fixture, diagnose, retry. Mutating tools (`write`, `edit`, `bash`, `sh`, `task`) and OpenSpec actions are absent, so any mutating step triggers `STRATEGY VIOLATION`.

## What Changes
- Expand `allowedActions` in `approveContract()` (index.js ~line 1531) to include all mutating and OpenSpec actions by default.
- The change MUST NOT introduce new security risks because `prohibitedActions` still gates destructive operations.

## Scope
- `index.js` (`approveContract`)

## Non-Goals
- Per-tool strategy override
- Per-session strategy override
- Auto-inference of `prohibitedActions`
