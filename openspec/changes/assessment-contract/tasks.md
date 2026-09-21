# Tasks: Assessment Contract

- [ ] 1. Define `Assessment` schema (JSON Schema or equivalent) in `assessment-engine.js`.
- [ ] 2. Implement `generateAssessment(task)` producing goal/scope/risk/evidence fields.
- [ ] 3. Implement `validateAssessment(a)` enforcing consistency rules (no scope/out-of-scope overlap, evidence ⊆ scope).
- [ ] 4. Persist assessments to `.wam/assessments/<task-id>.json` with schema versioning.
- [ ] 5. Wire pre-tool-call hook: block mutations when no valid assessment exists.
- [ ] 6. Implement re-assessment trigger on scope drift (new file in touched set, new risk class).
- [ ] 7. Implement post-completion reconciliation: diff predicted vs actual files-to-touch, emit drift report.
- [ ] 8. Add tests:
    - [ ] Assessment generated for trivial and multi-file tasks.
    - [ ] Mutation without assessment is blocked.
    - [ ] Stale assessment triggers re-assessment.
    - [ ] Contradictory scope/out-of-scope is rejected.
    - [ ] Drift report correctly identifies unpredicted file changes.
- [ ] 9. End-to-end test: full task lifecycle produces, uses, reconciles, and archives an assessment.