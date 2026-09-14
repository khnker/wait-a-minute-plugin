# wam-context-admission-enforcement

## Context

Assembly.js had preliminary unsafe edits: duplicate ADMISSION import, duplicate n0Spent declaration, N2 task state budget tracking lost, and no Router-as-canonical-admission-authority pattern.

## Goals

1. Fix syntax errors (duplicate import, duplicate const)
2. Restore N0/N2 canonical budget tracking (no loss of N2 task state reservation)
3. Make Context Router the canonical authority for admission/sufficiency decisions
4. Assembly respects Router's mandatory omissions and sufficiency — never silently contradicts
5. Explicit fallback/source reporting when Router unavailable
6. Add focused tests for the above

## Key Decisions

- Router is source of truth for sufficiency + mandatory omissions
- Assembly packs N0/N1/N2/N3/N4 and applies serialization limits (unchanged)
- Assembly does NOT redeclare sufficiency or admission classes independently
- If Router unavailable → fallback legacy, explicitly reported in result.source and rationale
- Mandatory items never dropped even if exceeding budget (existing policy, enforced)

## Files to Touch

- assembly.js (fixes + Router canonical admission)
- context-budget-admission.test.mjs (new tests)
- context-assembly.test.mjs (new tests if needed)
