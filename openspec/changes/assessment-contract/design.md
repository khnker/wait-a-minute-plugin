# Design: Assessment Contract

## 1. Assessment Artifact
Every non-trivial task MUST produce an `assessment.md` (or equivalent in-memory structure) before any side-effect tool call. The artifact captures:

- **Goal**: single-sentence intent.
- **Scope**: explicit list of in-scope paths/modules.
- **Out-of-scope**: explicit list of paths/modules the agent MUST NOT touch.
- **Files-to-touch**: predicted files with confidence (high/medium/low).
- **Risk-class**: SAFE / GUARDED / BLOCKED per the Action Risk Envelope.
- **Reversibility**: reversible / partially-reversible / irreversible.
- **Dependencies**: other assessments, specs, or contracts that gate this work.
- **Evidence-required**: tests, lints, benchmarks, logs, or docs the agent MUST produce to claim completion.
- **Exit-criteria**: machine-checkable predicates that determine "done".

## 3. Lifecycle Hooks
- **Pre-assessment hook** runs before any tool call. If no assessment exists, the agent MUST generate one and persist it.
- **Re-assessment trigger** fires when scope, risk, or files-to-touch change beyond a threshold (e.g., new file appears).
- **Post-completion reconciliation** diffs the assessment against actual changes; mismatch produces a reportable drift.

## 4. Storage
- In-session: held in the active context boundary.
- Cross-session: serialized under `.wam/assessments/<task-id>.json` for replay and audit.
- Schema-versioned so older assessments remain readable.

## 5. Failure Modes
- Missing assessment → agent MUST refuse non-read-only actions until one is produced.
- Stale assessment (older than N minutes or with drifted scope) → agent MUST re-assess.
- Inconsistent assessment (scope contradicts out-of-scope) → BLOCKED, escalate to human.