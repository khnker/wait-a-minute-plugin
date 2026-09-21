# Design: Execution Decoupling

## 1. Two-Phase Model
Every agent action is split into:

- **Reasoning phase (pure)**: produces an `ExecutionPlan` containing tool calls with full arguments. No side effects.
- **Execution phase (effectful)**: takes the `ExecutionPlan` and applies it, possibly with batching, retries, rollbacks, or human-in-the-loop gates.

The two phases communicate only through the plan artifact, which is serializable.

## 2. Plan Artifact
```json
{
  "planId": "...",
  "taskId": "...",
  "steps": [
    { "id": "s1", "tool": "edit", "args": {...}, "risk": "GUARDED", "rollback": "..." }
  ],
  "preconditions": [...],
  "postconditions": [...],
  "expectedEvidence": [...]
}
```

## 3. Execution Strategies
- **Sequential**: steps executed in order; failure halts.
- **Transactional**: steps batched into a sandbox; commit only if all postconditions hold.
- **Dry-run**: plan validated, no execution, diff emitted.
- **Replay**: pre-recorded plan executed deterministically against a fresh sandbox for testing.

## 4. Decoupling Benefits
- Plans can be reviewed by humans or other agents before execution.
- Plans can be queued, paused, resumed.
- Failures are recoverable via per-step rollback recipes.
- Tests run against plans, not agent state.

## 5. Failure Modes
- Plan invalid against current state (preconditions fail) → BLOCKED, replan.
- Plan executes but postconditions fail → ROLLBACK per recipe, emit drift.
- Plan steps reference files outside assessment scope → BLOCKED.