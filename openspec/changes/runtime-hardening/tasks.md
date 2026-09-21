# Tasks: Runtime Hardening

- [ ] 1. Implement L1 input sanitization in `sanitize-input.js`: paths, shell args, JSON, size budgets.
- [ ] 2. Implement L2 resource guards in `resource-guards.js`: timeouts, memory caps, loop detection, concurrency caps.
- [ ] 3. Implement L3 invariant monitors in `invariant-monitors.js`: scope, risk, evidence, reversibility.
- [ ] 4. Implement L4 failure containment: per-task sandbox, rollback per step, graceful shutdown.
- [ ] 5. Implement `hardening.yaml` config loader with permissive/standard/strict profiles.
- [ ] 6. Implement hardening telemetry emitter (`.wam/hardening.log`) and dashboard surfacing.
- [ ] 7. Wire guards and monitors into the tool interception layer.
- [ ] 8. Add tests:
    - [ ] Path traversal (`../../etc/passwd`) is blocked.
    - [ ] Shell injection (`; rm -rf /`) is blocked.
    - [ ] Prototype pollution payload is blocked.
    - [ ] Loop detection fires after N identical tool calls.
    - [ ] Out-of-scope mutation is blocked.
    - [ ] BLOCKED action without authorization is rejected.
    - [ ] Completion claim without verifier pass is rejected.
    - [ ] Crash recovery preserves in-flight state.
    - [ ] Strict mode rejects what standard accepts (e.g., short-circuit on minor drift).
- [ ] 9. End-to-end test: hostile inputs across all L1 categories are blocked; resource exhaustion triggers escalation; crash mid-task recovers cleanly.