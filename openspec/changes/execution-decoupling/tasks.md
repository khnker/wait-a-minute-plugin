# Tasks: Execution Decoupling

- [ ] 1. Define `ExecutionPlan` schema in `execution-planner.js` (JSON Schema, versioned).
- [ ] 2. Implement `planReasoningPhase(task)` producing an `ExecutionPlan` without side effects.
- [ ] 3. Implement execution strategies:
    - [ ] `executeSequential(plan)`
    - [ ] `executeTransactional(plan)` with sandbox + commit/rollback
    - [ ] `executeDryRun(plan)` emitting diff
    - [ ] `executeReplay(plan, fixture)` for deterministic testing
- [ ] 4. Implement preconditions/postconditions evaluator; rollback per step.
- [ ] 5. Wire agent loop: reasoning produces plan → human/reviewer approves (optional) → execution applies plan.
- [ ] 6. Ensure plan respects assessment scope (steps outside scope BLOCKED).
- [ ] 7. Add tests:
    - [ ] Plan produced from reasoning phase is purely declarative (no side effects in the producing function).
    - [ ] Sequential strategy halts on failure and emits drift.
    - [ ] Transactional strategy rolls back fully on postcondition failure.
    - [ ] Dry-run produces diff without mutating.
    - [ ] Replay reproduces recorded behavior against a fixture.
    - [ ] Out-of-scope steps are rejected.
- [ ] 8. End-to-end test: reasoning phase runs without filesystem mutation; execution phase applies plan with rollback on simulated failure.