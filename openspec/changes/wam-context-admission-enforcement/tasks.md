# wam-context-admission-enforcement — Tasks

## Tasks
- [x] Fix duplicate ADMISSION import in assembly.js
- [x] Fix duplicate n0Spent const declaration in assembly.js
- [x] Restore N2 task state budget tracking (n2TaskSpent added to reserved)
- [x] Remove local reserve()/spend()/dropByAdmission() reimplementation of admission logic; use Router canonical sufficiency
- [x] Add Router mandatory omission handling (explicit rationale, no silent drops)
- [x] Add explicit source reporting (router/legacy/fallback)
- [x] Add ADMISSION export from assembly.js
- [x] Add focused tests in context-budget-admission.test.mjs
- [x] Verify all P0 tests pass
