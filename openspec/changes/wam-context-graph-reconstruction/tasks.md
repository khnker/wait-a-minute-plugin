## 1. Core Implementation
- [ ] 1.1 Create `graph-builder.js` module.
- [ ] 1.2 Implement `buildContextGraph(taskState, runState, evidenceState)` function.
- [ ] 1.3 Map task dependencies and constraints to `ContextGraph`.
- [ ] 1.4 Map run decisions, actions, and observations.
- [ ] 1.5 Map evidence lineage and verification results.

## 2. Refactoring
- [ ] 2.1 Refactor `router-adapter.js` to consume `ContextGraph` from `graph-builder.js`.
- [ ] 2.2 Remove inline graph construction logic from `router-adapter.js`.

## 3. Verification
- [ ] 3.1 Create `graph-builder.test.mjs` with deterministic reconstruction tests.
- [ ] 3.2 Add graph equivalence tests verifying semantic mapping.
- [ ] 3.3 Ensure existing Router tests pass with the new graph builder.
