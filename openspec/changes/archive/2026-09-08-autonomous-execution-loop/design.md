# Design: autonomous-execution-loop

## OBSERVE → HYPOTHESIZE → EXPERIMENT → EVALUATE

```
OBSERVE
  ↓
HYPOTHESIZE (createHypothesis)
  ↓
EXPERIMENT (guardAction → execute)
  ↓
EVALUATE
  ├─ success → recordObservation, mark hypothesis verified
  ├─ failure → classify → archiveHypothesis, revise
  ├─ uncertainty → investigate (new hypothesis)
  └─ risk escalation → BLOCKED → require authorization
```

## Invariants
1. No blind repetition of failed experiments (hasRepetitiveFailure)
2. All hypotheses recorded (append-only JSONL)
3. All results recorded (observations.jsonl)
4. Failed hypotheses remain readable (never hard-delete, U1)
5. Strategy preserved while valid; escalate only on scope/risk/authorization change
6. BLOCKED actions require explicit authorization

## U1 (Elimination Scope)
- Soft-archive only: `archiveHypothesis` appends status `archived`
- Hard-delete tools (`rm`, `rmdir`, `git reset --hard`, `DROP`, `TRUNCATE`, `shred`, `unlink`) are BLOCKED by runtime-guards
- No records, DB entries, repos, or folders deleted without authorization

## Files
- `cognition-store.js`: hypothesis/experiment/observation store with soft-archive
- `runtime-guards.js`: guardAction with risk classification + repetition + hard-delete ban
- `engine.js`: execution loop integration
- `index.js`: /wam status command
