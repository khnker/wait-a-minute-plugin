# Tasks: add-verifiable-task-completion

## Phase 1 — OpenSpec and domain model

* [ ] Define `VerificationCheck`.
* [ ] Define `Evidence`.
* [ ] Define `VerificationResult`.
* [ ] Define requirement verification states.
* [ ] Define repository-state representation.
* [ ] Update completion contract representation.
* [ ] Update OpenSpec requirements and design documentation.

## Phase 2 — Verification Engine (`verification.js` implementado, 10/10 tests)

* [x] Create `verification.js`.
* [x] Implement command execution.
* [x] Implement cwd handling.
* [x] Implement timeout handling.
* [x] Implement exit-code capture.
* [x] Implement bounded stdout/stderr capture.
* [x] Implement output hashing.
* [x] Implement repository-state capture.
* [x] Implement Evidence generation.
* [x] Implement VerificationResult.

## Phase 3 — Requirement integration

* [ ] Associate verification checks with requirements.
* [ ] Implement requirement verification.
* [ ] Prevent textual evidence from producing false `VERIFIED`.
* [ ] Implement multiple-check evaluation.
* [ ] Implement verification failure handling.
* [ ] Implement evidence persistence.

## Phase 4 — Completion Gate

* [ ] Extend existing Completion Gate.
* [ ] Require valid verification evidence.
* [ ] Preserve existing child-task validation.
* [ ] Prevent DONE during VERIFYING.
* [ ] Prevent DONE when evidence is stale.
* [ ] Preserve existing fast-path behavior when no verification is required.

## Phase 5 — Evidence invalidation

* [ ] Detect implementation changes after verification.
* [ ] Invalidate affected requirement verification.
* [ ] Ensure stale evidence cannot satisfy DONE.
* [ ] Add tests for modification-after-verification.

## Phase 6 — CLI

* [ ] Add `/wam verify <requirement>`.
* [ ] Display verification checks.
* [ ] Display execution result.
* [ ] Display failure diagnostics.
* [ ] Keep `/wam progress` compatible with existing workflows.
* [ ] Ensure `verified` cannot be asserted without valid evidence.

## Phase 7 — Tests

### Unit tests

* [ ] command success
* [ ] command failure
* [ ] command timeout
* [ ] command error
* [ ] output truncation
* [ ] output hashing
* [ ] evidence creation
* [ ] repository-state capture
* [ ] multiple checks
* [ ] stale evidence

### Completion tests

* [ ] DONE with all requirements verified
* [ ] DONE with unverified requirement
* [ ] DONE with failed check
* [ ] DONE with timeout
* [ ] DONE with stale evidence
* [ ] DONE with incomplete child task
* [ ] textual evidence attempting to fake verification

### Security tests

* [ ] arbitrary evidence command is never executed
* [ ] only approved contract commands execute
* [ ] command timeout cannot block WAM indefinitely

## Phase 8 — Documentation

* [ ] Update README lifecycle.
* [ ] Document `IMPLEMENTED` vs `VERIFIED`.
* [ ] Document machine-verifiable evidence.
* [ ] Document `/wam verify`.
* [ ] Document Completion Gate semantics.
* [ ] Document limitations of manual evidence.
* [ ] Document repository-state binding.
