# wam-context-admission-enforcement — Design

## Architecture

Router is the canonical authority for admission/sufficiency decisions affecting assembly output.

## Key Contracts

1. **Router Authority**: When Router result is available (`source === "router"`), Router's sufficiency controls Assembly's reported sufficiency. Router's `omitted` MANDATORY nodes produce explicit `admission: MANDATORY omitted by router` rationale entries — never silent drops.

2. **N0/N2 Canonical**: N0 (global policy) and N2 (live task state) are MANDATORY. N2 task state reservation (`n2TaskSpent`) is tracked in `reserved`. The duplicate `n0Spent` declaration was removed; N0 is reserved once.

3. **Fallback Explicit**: When Router is unavailable (`source === "fallback"` or null graph), Assembly uses legacy selector and reports `source: "legacy"` in result. Router sufficient → Assembly sufficient; Router insufficient → Assembly insufficient.

4. **Assembly does not redeclare admission**: It consumes Router's admission decisions. `ADMISSION` imported from `context-router.js` as single source.

## Files Modified

- `assembly.js`: Fix duplicate import/const, restore N2 budget tracking, Router canonical sufficiency, explicit source reporting, mandatory omission handling
- `context-budget-admission.test.mjs`: Add focused tests for wam-context-admission-enforcement
