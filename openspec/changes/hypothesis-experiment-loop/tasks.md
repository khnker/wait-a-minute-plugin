# Tasks: Hypothesis Experiment Loop

- [x] 1. Create `cognition-store.js` (hypotheses/experiments/observations JSONL persistence).
- [x] 2. Implement `createHypothesis`, `updateHypothesis`, `rejectHypothesis`.
- [x] 3. Implement `createExperiment`, `completeExperiment`, `failExperiment`.
- [x] 4. Implement `recordObservation`.
- [x] 5. Add experiment uniqueness detection (same hypothesis + same action).
- [x] 6. Add cognitive-state accessor for context assembly.
- [x] 7. Add regression tests:
    - [x] Hypothesis lifecycle.
    - [x] Experiment lifecycle.
    - [x] Observation linking.
    - [x] Failed hypothesis does not fail task.
    - [x] Repeated experiment warning.
