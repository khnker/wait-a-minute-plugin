# Tasks: Autonomy Runtime Guards

- [ ] 1. Create `runtime-guards.js` with `evaluateGuardedAction`.
- [ ] 2. Wire cognitive state into risk evaluation.
- [ ] 3. Add experiment-aware GUARDED authorization.
- [ ] 4. Add failure-recording hook (post-action observation).
- [ ] 5. Enforce DONE protection in completion gate.
- [ ] 6. Add regression tests:
    - [ ] GUARDED without experiment requires confirmation.
    - [ ] GUARDED with active experiment passes.
    - [ ] Failed mutation records observation, doesn't retry.
    - [ ] DONE blocked when evidence missing.
