# Design: Decision-Critical Uncertainty

## Approach

Rule-based classification in `engine.js`, surfaced through the existing `unknowns`/`assumed` arrays of the analysis result.

### classifyUncertainty(item) — engine.js

Deterministic classifier for one uncertainty/assumption string:

1. `RESOLVABLE` if it references repository facts (stack, files, config, tests, docs) or is phrased as inspectable ("cómo se maneja X", "cuál es el formato", "existe Y") — the answer exists in the repo.
2. `DECISION_CRITICAL` if it touches a material-impact lexicon: migration/data loss, deletion/destructive, security/auth/token, schema/API contract, scope/architecture, compatibility, user-visible behavior, acceptance criteria.
3. `NON_BLOCKING` otherwise (cosmetic, naming, preference-level).

Priority: DECISION_CRITICAL > RESOLVABLE > NON_BLOCKING (a destructive-sounding clause is critical even if inspectable, per R3 safety).

### analyze() — engine.js

After `auditAssumptions`, map each assumed/unknown entry through `classifyUncertainty` and attach:

```
uncertainties: [
  { id: "U1", question: "...", classification: "RESOLVABLE|NON_BLOCKING|DECISION_CRITICAL", status: "active" }
]
```

### Completion Contract — engine.js

`synthesizeContract` embeds `unknowns` (blocking DECISION_CRITICAL entries, status `blocking`) into the contract. Contract stays PROPOSED while `unknowns.some(status === "blocking")`.

### Gate — index.js

`approveContract` refuses when a blocking DECISION_CRITICAL uncertainty exists:

```
{ ok: false, reason: "U1 DECISION_CRITICAL sin responder (bloquea aprobación)" }
```

`evaluateCompletionGate` treats blocking unknowns as pending requirements for DONE claims.

### Persistence — state.yaml

Contract serializes `unknowns` array; preserved by `buildPersistedState` (existing-contract branch).

## Files

- `engine.js`: `classifyUncertainty`, analyze() wiring, synthesizeContract unknowns.
- `index.js`: approveContract guard, gate integration, presentValidation shows blocking unknowns.
- Tests: `decision-critical-uncertainty.test.mjs` (3 classifications, resolvable-first, gate blocks approval, regression: no-uncertainty tasks unchanged).
