# Proposal: autonomous-execution-loop

## Why
WAM's autonomy is currently expressed primarily as policy in `runtime-guards.js` and the risk envelope. But the system has no formal hypothesis-driven execution loop: failed experiments can repeat, hard-deletes slip through unless caught by separate regex, and the lifecycle state lives implicitly across `index.js`. The agent cannot reliably know "what does WAM know about my attempt, and why was this blocked?".

This change converts autonomy from policy-only to verifiable behavior. Every GUARDED mutation must carry a hypothesis. Repetition of a failed hypothesis+action is structurally blocked. Hard-deletes are categorically BLOCKED (U1). The execution loop is observable via `/wam status`.

## What Changes
- `cognition-store.js`: add `DELETION_POLICY`, `archiveHypothesis`, `hasRepetitiveFailure`, `listExperiments`, `listHypotheses`
- `runtime-guards.js`: enforce hard-delete ban, repetition guard, risk classification
- `execution-engine.js`: formal OBSERVE→HYPOTHESIZE→EXPERIMENT→EVALUATE loop with soft-archive
- `engine.js`: integrate execution loop into `analyze`
- `index.js`: expose `/wam status` command
- Tests: `runtime-guards.test.mjs`, `execution-engine.test.mjs`, `cognition-store.test.mjs`

## Scope
- `cognition-store.js`
- `runtime-guards.js`
- `execution-engine.js`
- `engine.js`
- `index.js`
- Tests

## Non-Goals
- OpenSpec runtime integration (deferred to `runtime-openspec`)
- Second-pass review (deferred to `second-pass-review`)
- Scope drift detection (deferred to `scope-and-strategy-enforcement`)