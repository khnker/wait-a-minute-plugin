# Design: Durable State

## 1. State Surfaces
Agent state is partitioned into:

- **Assessment state**: `.wam/assessments/<task-id>.json`
- **Plan state**: `.wam/plans/<plan-id>.json`
- **Evidence state**: `.wam/evidence/<task-id>/<step-id>.<ext>`
- **Completion state**: `.wam/completions/<task-id>.json` + report
- **Drift state**: `.wam/drift/<task-id>.log` (append-only)
- **Index**: `.wam/state-index.json` (lightweight metadata for fast queries)

## 2. Write Discipline
- All writes are atomic (write-temp + rename) to avoid torn files.
- All writes are schema-validated before commit.
- All writes carry a `stateVersion` and `lastModifiedAt` timestamp.

## 3. Read Discipline
- Reads validate schema before hydration; corrupted state is quarantined and reported.
- Reads return immutable views to prevent accidental mutation.

## 4. Recovery Protocol
On agent startup:
1. Load `state-index.json`.
2. For each unfinished task, attempt hydration.
3. If hydration fails, mark task as `NEEDS_RECOVERY` and emit a recovery prompt.
4. Resume from last durable checkpoint (assessment + plan + last completed step).

## 5. Consistency Guarantees
- Per-task ordering: assessment → plan → evidence → completion is enforced.
- Cross-task: concurrent tasks do not share mutable state without explicit synchronization.
- Garbage collection: orphaned plans, evidence, and reports older than retention window are pruned.

## 6. Query API
`stateQuery({ taskId, type, since, until })` returns matching state entries. Used by drift reports, audit, and the dev dashboard.