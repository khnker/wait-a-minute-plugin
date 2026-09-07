# Tasks: Hypothesis Experiment Loop

- [ ] 1. Create `cognition-store.js` (hypotheses/experiments/observations JSONL persistence).
- [ ] 2. Implement `createHypothesis`, `updateHypothesis`, `rejectHypothesis`.
- [ ] 3. Implement `createExperiment`, `completeExperiment`, `failExperiment`.
- [ ] 4. Implement `recordObservation`.
- [ ] 5. Add experiment uniqueness detection (same hypothesis + same action).
- [ ] 6. Add cognitive-state accessor for context assembly.
- [ ] 7. Add regression tests:
    - [ ] Hypothesis lifecycle.
    - [ ] Experiment lifecycle.
    - [ ] Observation linking.
    - [ ] Failed hypothesis does not fail task.
    - [ ] Repeated experiment warning.
