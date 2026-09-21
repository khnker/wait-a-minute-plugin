# Tasks: Completion Integrity

- [ ] 1. Define `ExitCriterion` and `Evidence` types in `completion-verifier.js`.
- [ ] 2. Implement evidence collectors per type: `collectTestEvidence`, `collectLintEvidence`, `collectArtifactEvidence`, `collectDiffEvidence`.
- [ ] 3. Implement `verifyCompletion(taskId)` returning VERIFIED/INSUFFICIENT/MISMATCH/STALE.
- [ ] 4. Wire verifier into completion-claim path: agent can only emit "done" when VERIFIED.
- [ ] 5. Generate `completion-report.md` with verdict, evidence list, consumer-test status, drift notes.
- [ ] 6. Block completion anti-patterns:
    - [ ] Reject `as any`, `@ts-ignore`, `@ts-expect-error` introduced by the change.
    - [ ] Reject skipped tests (`it.skip`, `describe.skip`) added by the change.
    - [ ] Reject completion when consumer tests regress.
- [ ] 7. Implement freshness window: stale evidence (e.g., older than scope change) invalidates completion.
- [ ] 8. Add tests:
    - [ ] VERIFIED when all criteria pass.
    - [ ] INSUFFICIENT when test missing.
    - [ ] MISMATCH when test fails.
    - [ ] BLOCKED when `as any` introduced.
    - [ ] BLOCKED when consumer regresses.
    - [ ] Completion report contains all required fields.
- [ ] 9. End-to-end test: agent claims completion on a real change → verifier asserts all gates pass.