# Production Integrity Hardening — Design

## Goal

Harden WAM runtime for production by closing P0 integrity gaps across task identity, session isolation, evidence validity, verification, completion gating, context routing, and repository hygiene.

## Architecture & Flow

### 1. Task Identity Precedence

`runtime/message-handler.js` and `index.js`: an explicit `taskId` in the command payload takes absolute precedence over any `findDuplicateTask` result. Duplicate detection serves only as a suggestion when no explicit ID is provided. The `effectiveTaskId` flow is: explicit taskId → duplicate suggestion (only if no explicit) → resolveNewTaskId.

### 2. Session Isolation

`index.js` active-task storage is scoped per `(sessionId, projectRoot)` tuple, not global per repo. `readActiveTaskIdFresh` validates both sessionId and projectRoot ownership before returning a task. `context.js` session cache is per-root, not global `_sessionCache`, preventing cross-session/cross-repo leakage.

### 3. Evidence Structural Validity

`evidence-lineage.js` `verifyEvidence`: a PASS verification requires full lineage — `requirementId`, `hypothesisId`, `experimentId`, AND `observationId` must all be present. Without complete lineage, evidence is marked `insufficient` regardless of PASS result. `getAllEvidence` sorts by `Date.parse(createdAt)` ascending with deterministic ID tiebreak.

### 4. Verification Integrity

`verification.js` `evaluateRequirement`: each check maps 1:1 to a single `check_id`. Duplicate `check_id` values fail verification. Unknown or missing check IDs also fail. No silent pass on ambiguous mapping.

### 5. Completion Gate Supersession

`evidence-lineage.js` `getCompletionStatus`: completion considers the latest valid evidence superseding stale/invalidated evidence. `invalidateDependentEvidence` marks dependent evidence STALE, and the completion gate ignores STALE entries when computing satisfaction.

### 6. Context Router Evidence Inclusion

`context.js` `requiredClosure`: `requires_completion` and `requires_output` edges are included in the closure. `supports` edges on evidence linked to requirements are included. Context oracle returns evidence that supports requirement completion.

### 7. Repository Hygiene

- `.gitignore`: add `node_modules/`
- `engine.js`: remove hardcoded debug `console.log`
- `package.json`: fix duplicate `"type": "module"` field

## Data Model

No new global state. Changes are scoping/refinement:
- Active task: keyed by `(sessionId, projectRoot)` instead of projectRoot alone.
- Evidence validity: requires 4 lineage fields.
- Verification checks: 1:1 check_id mapping, duplicates fail.
- Completion: latest valid evidence wins, STALE ignored.

## Backward Compatibility

- Explicit taskId behavior is new; existing flows without explicit taskId continue through duplicate detection.
- Evidence without full lineage transitions from potentially `valid` to `insufficient` on next verification; existing STALE evidence in DB is handled gracefully (kept as-is until re-verified).
