# End-to-End Test Suite: Production Hardening Plan

## Objective
Specify a cross-cutting end-to-end test suite that exercises the integration of all seven hardening phases (Assessment Contract, Completion Integrity, Execution Decoupling, Durable State, Context Production, Runtime Hardening, Release Production) in realistic, multi-step scenarios. Each scenario MUST run against the actual plugin runtime, not mocks, and MUST fail if any phase regresses.

## Test Suite Architecture

### Test Harness
- File: `test/e2e/hardening-suite.test.mjs`
- Runner: Node's built-in `node:test` (matches existing test style).
- Driver: a thin orchestrator that boots the plugin, fakes a session, and asserts on observed behavior + durable state.
- Environment: isolated tempdir per test; `.wam/` recreated fresh; no network.

### Common Fixtures
- `fixtureRepo()`: builds a temp git repo with a sample module + consumer.
- `fixtureTask()`: builds a minimal `Assessment` + `ExecutionPlan` for the fixture repo.
- `fixtureHostilePayloads()`: returns the canonical set of malicious inputs for sanitization tests.
- `fixtureBrokenState()`: a deliberately corrupted `.wam/state-index.json` for recovery tests.

---

## E2E Scenarios

### S1. Happy-Path Multi-File Change (All 7 Phases)
- **Asserts**: Assessment → Plan → Execution → Evidence → Completion → Context → Hardening → Release flow succeeds end-to-end.
- **Steps**:
  1. Boot plugin in standard mode.
  2. Submit a task that touches 3 files (1 source, 1 test, 1 doc).
  3. Confirm `Assessment` is produced and persisted.
  4. Confirm `ExecutionPlan` references exactly the 3 predicted files.
  5. Execute plan sequentially; confirm evidence collected (test pass, lint clean, typecheck clean).
  6. Confirm `Completion` is `VERIFIED`.
  7. Confirm canonical context artifact is produced and consumed in a follow-up session.
  8. Confirm `.wam/hardening.log` contains no BLOCKED events.
  9. Trigger release gate; confirm all 7 gates pass; confirm release manifest written.
- **Pass criteria**: gate result = `PASS`; manifest contains expected fields; no drift.

### S2. Drift Detection (Phases 1, 3, 4, 6)
- **Asserts**: unpredicted file changes are detected and block completion.
- **Steps**:
  1. Plan predicts 2 files; during execution, agent (or test driver) writes a 3rd file.
  2. Confirm post-completion reconciliation flags drift.
  3. Confirm `Completion` is `MISMATCH` or `INSUFFICIENT` until drift is justified.
  4. Confirm hardening log records the scope violation.
- **Pass criteria**: completion not granted; drift report names the 3rd file.

### S3. Hostile Input Sanitization (Phase 6)
- **Asserts**: L1 sanitization blocks every canonical hostile payload.
- **Payloads**:
  - Path traversal: `../../etc/passwd`, `C:\Windows\System32`.
  - Shell injection: `; rm -rf /`, `$(curl evil)`, backticks.
  - Prototype pollution: `{"__proto__": {"polluted": true}}`.
  - Oversized blob: 100MB string payload.
  - JSON depth bomb.
- **Pass criteria**: each payload is rejected with a clear sanitization report; no side effect occurs.

### S4. Resource Exhaustion & Loop Detection (Phase 6)
- **Asserts**: L2 guards fire on loops and resource caps.
- **Steps**:
  1. Issue the same `grep` call with the same args 10 times.
  2. Confirm loop detection fires after threshold.
  3. Confirm concurrency cap is enforced when 20 tool calls are issued in parallel.
  4. Confirm timeout fires on a deliberately long-running shell call.
- **Pass criteria**: each guard fires; agent is escalated, not silently retried forever.

### S5. Durable State Recovery (Phase 4)
- **Asserts**: state survives a simulated crash mid-task.
- **Steps**:
  1. Start a multi-step plan.
  2. After step 2 of 5, simulate crash (kill the orchestrator process).
  3. Restart plugin.
  4. Confirm `state-index.json` reports the task as `IN-FLIGHT`.
  5. Confirm recovery resumes from step 3 (not step 1, not step 5).
- **Pass criteria**: no step is repeated; no step is skipped; completion ultimately verified.

### S6. Corrupted State Quarantine (Phase 4)
- **Asserts**: schema-invalid state is quarantined, not silently dropped.
- **Steps**:
  1. Pre-populate `.wam/state-index.json` with an entry that fails schema validation.
  2. Boot plugin.
  3. Confirm the corrupted entry is moved to `.wam/quarantine/`.
  4. Confirm a recovery prompt is emitted naming the quarantined task.
- **Pass criteria**: agent does not silently lose the task; recovery prompt is actionable.

### S7. Stale Context Refusal (Phase 5)
- **Asserts**: consumer refuses stale canonical context.
- **Steps**:
  1. Produce a context artifact with freshness window = 1 second.
  2. Wait 2 seconds.
  3. Attempt to consume from a new session.
  4. Confirm refusal with explicit "stale" message.
- **Pass criteria**: no silent consumption; message names the artifact and the staleness reason.

### S8. Release Gate Blocking (Phase 7)
- **Asserts**: a release is blocked when any gate fails.
- **Sub-scenarios** (one test per gate):
  - S8a: missing assessment → blocked.
  - S8b: completion = INSUFFICIENT → blocked.
  - S8c: unpredicted file in change-set → blocked.
  - S8d: stale context artifact in change-set → blocked.
  - S8e: unresolved BLOCKED event in hardening log → blocked.
  - S8f: consumer test regression → blocked.
  - S8g: irreversible step without signoff → blocked.
- **Pass criteria**: each sub-scenario blocks the release with a named gate failure.

### S9. Atomic Rollback (Phase 7)
- **Asserts**: rollback fully reverts state to pre-release snapshot.
- **Steps**:
  1. Execute a release to staging.
  2. Capture pre-release state snapshot.
  3. Trigger rollback.
  4. Confirm filesystem + durable state match the pre-release snapshot exactly.
- **Pass criteria**: byte-equal restoration; no orphaned files; durable state matches.

### S10. Multi-Signer Approval (Phase 7)
- **Asserts**: strict mode requires all configured signers.
- **Steps**:
  1. Configure 2 signers in `.wam/release.yaml`.
  2. Attempt release with only 1 signature.
  3. Confirm release is blocked.
  4. Add 2nd signature; confirm release proceeds.
- **Pass criteria**: incomplete signoff blocks; complete signoff releases.

---

## Cross-Cutting Assertions

For every E2E scenario, the suite MUST additionally assert:

- **No console errors** during execution.
- **No leftover temp files** after teardown.
- **No leaked processes** (verified via `pgrep` or equivalent).
- **Schema-valid state** at the end (every JSON file in `.wam/` validates).
- **Schema-valid manifests** for every release produced.
- **Logs present** for every blocking event (sanitization, hardening, gate failure).

---

## Test Suite Layout

```
test/e2e/
  hardening-suite.test.mjs       # S1, S2, S3, S4, S7, S10
  durable-state.test.mjs         # S5, S6
  release-gate.test.mjs          # S8, S9
  fixtures/
    fixture-repo.mjs
    fixture-task.mjs
    fixture-hostile-payloads.mjs
    fixture-broken-state.mjs
  helpers/
    boot-plugin.mjs
    teardown.mjs
```

## CI Integration

- E2E suite runs on every PR via GitHub Actions (or equivalent).
- Suite MUST complete in < 5 minutes (parallelize where safe).
- Any failure blocks merge.
- Suite is hermetic: no network, no global state mutation.

## Reporting

- A `e2e-report.md` is generated per run with: pass/fail per scenario, gate-level results, drift notes, log excerpts.
- Report is uploaded as a CI artifact.
- Report is also persisted under `.wam/e2e/<run-id>/` for cross-run comparison.