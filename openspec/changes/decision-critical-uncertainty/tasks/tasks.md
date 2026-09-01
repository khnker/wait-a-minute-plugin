# Tasks: Decision-Critical Uncertainty

## T1 — classifyUncertainty (engine.js)

Implement deterministic classifier with the three categories and the safety priority (DECISION_CRITICAL > RESOLVABLE > NON_BLOCKING).

**Verify**: `node --test decision-critical-uncertainty.test.mjs` — three classifications covered.

## T2 — Wire into analyze() (engine.js)

Map assumed/unknown entries to `uncertainties: [{id, question, classification, status}]` in the analysis result.

**Verify**: analyze() output contains `uncertainties` array with classifications.

## T3 — Contract unknowns + approval guard (engine.js, index.js)

- `synthesizeContract` embeds blocking unknowns.
- `approveContract` refuses while a blocking DECISION_CRITICAL uncertainty exists.
- `evaluateCompletionGate` counts blocking unknowns as pending.

**Verify**: approve blocked with U1 blocking; allowed after resolution; no-uncertainty task unchanged (regression).

## T4 — Persistence + validation display

Contract `unknowns` survives `buildPersistedState`; `presentValidation` lists blocking unknowns.

**Verify**: state.yaml round-trips unknowns; validation block shows blocking unknown.
