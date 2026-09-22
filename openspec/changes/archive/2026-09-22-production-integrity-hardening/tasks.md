# Production Integrity Hardening — Tasks

## Implementation
1. [x] runtime/message-handler.js: explicit taskId precedence over duplicate detection
2. [x] index.js: effectiveTaskId with explicit taskId priority, readActiveTaskIdFresh with session/projectRoot validation
3. [x] context.js: per-root session cache replacing global _sessionCache
4. [x] evidence-lineage.js: getAllEvidence Date.parse ordering, verifyEvidence full lineage validation
5. [x] verification.js: evaluateRequirement 1:1 check_id mapping
6. [x] evidence-lineage.js: getCompletionStatus ignores stale/invalidated, invalidateDependentEvidence by requirementId
7. [x] context.js: requiredClosure includes requires_completion/requires_output and evidence supports
8. [x] .gitignore: add node_modules/
9. [x] engine.js: remove hardcoded debug console.log
10. [x] package.json: fix duplicate "type":"module"

## Verification
11. [x] node --test evidence-lineage.test.mjs (all pass)
12. [x] node --test --test-concurrency=1 all discoverable suites (timeout issue investigated, sequential runner works)
13. [x] openspec validate --changes

## Commit
14. [ ] git add -A && git commit -m "fix: production integrity hardening — task identity, evidence, verification"
15. [ ] git push