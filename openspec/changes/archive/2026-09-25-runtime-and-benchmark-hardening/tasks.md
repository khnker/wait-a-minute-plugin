# Tasks: Runtime and Benchmark Hardening

## TASK-08: requirement::output contract
- [x] Fix import paths in `tests/context-output-benchmark.test.mjs`
- [x] Add explicit `requires` edge in test scenario to ensure oracle can compute closure
- [x] Fix router to include explicitly MANDATORY-admission nodes in required set (`context-router.js`)
- [x] Verify: `node --test tests/context-output-benchmark.test.mjs` passes with SPR=1, COR=0, CWR=0

## TASK-10: Real CWR with usedIds/usedTokens
- [x] Update `context-optimization-metrics.js` to return `CWR = null` when no evidence exists (no usedIds, no usedTokens)
- [x] Update `context-benchmark.mjs` to pass through scenario `usedIds` when selector returns undefined
- [x] Verify: `node --test context-optimization.test.mjs` passes (CWR=null without evidence)

## OpenSpec artifacts
- [x] Create `proposal.md`
- [x] Create `design.md`
- [x] Create `tasks.md` (this file)

## Validation
- [x] `openspec validate --all --strict` passes
- [x] Task state updated with TASK-10 and validations