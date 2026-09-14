# Proposal: scope-and-strategy-enforcement

## Why
`approvedStrategy` exists in `state.yaml` but the relationship between STRATEGY (objective, scope, allowed/prohibited actions) and CURRENT EXECUTION (hypothesis, experiment, files touched, actions performed, evidence) is implicit. There is no formal scope drift detection. An agent can silently expand its scope (refactor parser + change API + rename domain objects) without triggering authorization.

## What Changes
- A `scope` object on each task tracks STRATEGY vs CURRENT EXECUTION.
- A `detectScopeDrift(strategy, execution)` function classifies drift as: `none`, `small_safe`, `material`, `prohibited`.
- Policy: `small_safe` drift is allowed and recorded; `material` drift requires authorization; `prohibited` drift blocks.
- A `recordDrift()` function appends to the execution log.

## Scope
- `index.js` (drift hooks in `tool.execute.before` and `/wam contract edit`)
- `engine.js` (scope tracking on task state)
- New: `scope-enforcement.js` (drift detection + policy)

## Non-Goals
- Automatic re-authorization workflow
- Per-tool drift scoring
- Cross-task drift aggregation
