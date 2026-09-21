# Design: Completion Integrity

## 1. Completion Evidence Contract
A task is "complete" iff ALL of its declared exit-criteria (from the Assessment) have observable evidence. Evidence types:

- **Test**: a passing test file with name matching the task ID.
- **Lint**: zero new lint errors introduced by the change.
- **Typecheck**: zero new type errors.
- **Artifact**: a file exists at a declared path with expected schema/hash.
- **Diff**: the diff between predicted and actual files-to-touch is empty or justified.

## 2. Verifier Module
`verifyCompletion(taskId)` returns:
- `VERIFIED` — all evidence present and passing.
- `INSUFFICIENT` — missing evidence; lists what's missing.
- `MISMATCH` — evidence present but contradicts exit-criteria (e.g., test fails).
- `STALE` — evidence older than declared freshness window.

## 3. Integration Points
- The agent MUST NOT mark a task complete until `verifyCompletion` returns `VERIFIED`.
- The plugin emits a "completion-claim" event with the verifier result for downstream audit.
- In tests, completion claims are intercepted and asserted by `completion-integrity.test.mjs`.

## 4. Anti-Patterns Blocked
- Self-claim without verifier (`as any`, `@ts-ignore`, skipped tests, mocked assertions) → BLOCKED.
- Completion claim after partial evidence → INSUFFICIENT, agent prompted to backfill.
- Completion claim with regressed consumers (caller's tests fail) → MISMATCH.

## 5. Reporting
A `completion-report.md` is generated per task containing:
- Verdict (VERIFIED/INSUFFICIENT/MISMATCH/STALE).
- Evidence list with file paths and exit-criteria satisfied.
- Consumer-test status (tests of files that import the changed module).
- Drift notes (predicted vs actual).