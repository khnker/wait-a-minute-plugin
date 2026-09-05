# Tasks — refactor-context-engine

## 1. Budget reservation in assembly.js
- [x] 1.1 Add `reserve(level, text)` and `spend(level, text)` separation
- [x] 1.2 Pre-compute reserved cost before any flex spend
- [x] 1.3 Emit `budget_violation: boolean` in result
- [x] 1.4 N0 line always present even on violation
- [x] 1.5 Add test: budget 10 (violation), 100 (tight), 150 (room)

## 2. Session isolation strictness in context.js
- [x] 2.1 Replace `=== undefined` clause with explicit `null` for global
- [x] 2.2 Implement `migrateLegacyCapsules(root, { dryRun })`
- [x] 2.3 Reserve `"legacy"` as a sentinel id (LEGACY_SESSION_ID export)
- [x] 2.4 Expose `/wam ctx migrate [--dry-run]` in index.js
- [x] 2.5 Add tests: legacy excluded from session; migration idempotent; dryRun safe

## 3. Confidence unification
- [x] 3.1 Replace VALID_CONFIDENCE Set with `normalizeConfidence`/`confidenceLabel` in memory.js
- [x] 3.2 Normalize on read; numeric on write
- [x] 3.3 Display helper `confidenceLabel(n)`
- [x] 3.4 Remove `parseFloat(meta.confidence)` from assembly.js
- [x] 3.5 Use numeric comparison directly in provenance loop (gated: inferred+low OR severe <0.4)
- [x] 3.6 Add tests: string→number; provenance warning emits for numeric low conf

## 4. Assembly / context boundary documentation
- [x] 4.1 Add header comment to assembly.js describing its role (Context Pack Builder)
- [x] 4.2 Add header comment to context.js describing its role (Context Selection Engine)
- [x] 4.3 Keep local tokenize in assembly.js (deliberate, project-doc section matching)

## 5. Alias dictionary in context.js
- [x] 5.1 Define ALIASES constant (closed set, no fuzzy match)
- [x] 5.2 Apply in `tokenize` of context.js only
- [x] 5.3 Add tests: query "auth" matches "authentication"; "postgres"↔"postgresql"

## 6. Validation
- [x] 6.1 Full suite: 12 added + 108 existing + 21 wait-a-minute = 141 tests
- [x] 6.2 All green: 141 pass / 0 fail

