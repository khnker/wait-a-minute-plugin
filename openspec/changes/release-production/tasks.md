# Tasks: Release Production

- [ ] 1. Implement `release-gate.js` aggregating all gates (assessment, completion, drift, context, hardening, consumer-tests, reversibility).
- [ ] 2. Implement release pipeline stages: pre-flight, authoring, verification, approval, rollout, post-rollout monitoring.
- [ ] 3. Define release manifest schema (`manifest.json`) with change-set, version, gate results.
- [ ] 4. Implement rollback recipe executor; atomic, driven by `rollback-recipe.json`.
- [ ] 5. Implement canary rollout with configurable percentage; auto-rollback on threshold breach.
- [ ] 6. Wire dashboard surfacing: completion rates, hardening events, gate failures.
- [ ] 7. Implement `.wam/release.yaml` config loader: signers, canary %, rollback thresholds, required gates.
- [ ] 8. Implement multi-signer approval flow for strict mode.
- [ ] 9. Add tests:
    - [ ] Release blocked when any gate fails (one test per gate).
    - [ ] Rollback fully reverts state to pre-release snapshot.
    - [ ] Canary rollout respects configured percentage.
    - [ ] Auto-rollback fires on completion-rate regression.
    - [ ] Multi-signer flow rejects incomplete signoff.
    - [ ] Release manifest contains all required fields with valid schema.
- [ ] 10. End-to-end test: full release cycle → canary → threshold breach → auto-rollback → state recovery.