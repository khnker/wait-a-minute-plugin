# Proposal: Runtime and Benchmark Hardening

## Summary
Close TASK-08 (requirement::output contract) and TASK-10 (real CWR with usedIds/usedTokens) to make the context optimization benchmark production-ready.

## Problem
- TASK-08: The router selector did not treat `type: "output"` with `admission: "MANDATORY"` as required, causing SPR=0 and COR=1 in benchmarks.
- TASK-10: CWR was computed as 0 when no `usedIds`/`usedTokens` were provided, instead of `null` (no evidence).
- Test imports in `tests/context-output-benchmark.test.mjs` were broken (relative path from tests/ directory).
- OpenSpec change `runtime-and-benchmark-hardening` was created but lacked all required artifacts.

## Solution
1. Fix router to include explicitly MANDATORY-admission nodes in required set (`context-router.js`).
2. Fix benchmark router to respect `usedIds: undefined` semantic (Change 05) and pass through scenario `usedIds` correctly.
3. Update `context-optimization-metrics.js` to return `CWR = null` when no evidence exists.
4. Fix test imports and add explicit `requires` edge in test scenario.
5. Create complete OpenSpec change artifacts.

## Acceptance Criteria
- `node --test tests/context-output-benchmark.test.mjs` passes (SPR=1, COR=0, CWR=0).
- `node --test context-optimization.test.mjs` passes (CWR=null without evidence).
- `openspec validate --all --strict` passes.
- Task state updated with TASK-10 and validations.