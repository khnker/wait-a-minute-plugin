# Refactor: Context Engine Hardening

## Why

Code review of current main branch surfaced four P0/P1 structural problems in the
context system that, left unfixed, will produce silent failures under edge inputs
and two competing sources of authority for what enters the prompt.

The change is structural (architecture), not feature work: it consolidates budget,
session isolation, confidence model, and the assembly/context split. No new
capabilities, no new files unless strictly required.

## What Changes

- assembly.js: budget partitioned into `reserved` (N0+N2) and `flex` (N1+N3);
  emit `budget_violation` flag; N0 always present even on violation.
- context.js: session isolation strictness — `matchesSession` rejects legacy
  capsules unless migrated; new `migrateLegacyCapsules(root, {dryRun})`;
  `LEGACY_SESSION_ID` sentinel; `/wam ctx migrate` exposed in index.js.
- context.js: closed ALIASES dictionary applied during `tokenize` for capsule
  relevance (auth↔authentication, postgres↔postgresql, jwt→token, etc.).
- memory.js: replace string `VALID_CONFIDENCE` Set with numeric
  `normalizeConfidence` / `confidenceLabel`; persist numeric, normalize legacy
  strings on read.
- assembly.js: remove `parseFloat(meta.confidence)` (NaN-silent-warning bug);
  comparison via `normalizeConfidence` directly.
- index.js: register `/wam ctx migrate [--dry-run]` command.
- New test file: `refactor-context-engine.test.mjs` (12 cases covering the four
  P0 fixes).
- Header comments in assembly.js / context.js documenting the engine boundary:
  assembly = Context Pack Builder, context = Context Selection Engine.

## Problems being fixed

### P0-1 Budget does not reserve obligatory levels (assembly.js)

Current `spend()` rejects greedily in N0/N1/N3/N2 order. If `budget` is smaller than
the mandatory minimum (N0 policy + N2 task), they can be silently dropped. The
README claims N0/N2 are mandatory; the code does not guarantee it.

Fix: partition budget — reserve N0 and N2 first, allocate remainder to N1 and N3.
If reserved total exceeds budget, surface a `budget_violation` in the result and
still emit N0 (N0 is policy; even on violation the policy line must be present so
the agent knows it is in scope(ACTIVE)).

### P0-2 Session isolation has undefined leak (context.js:91)

`listCapsules` filter accepts `c.session_id === undefined` as compatible with any
session. A capsule stored by legacy code (pre-session feature) bleeds into every
new session. The user answered U2 with **"Migrate"** — legacy data must be moved
to a `legacy` session bucket, not silently treated as global.

Fix:
- Distinguish `null` (explicit global) vs missing key (legacy) vs string (scoped).
- Add `migrateLegacyCapsules(root)` that assigns `session_id = "legacy"` to any
  capsule lacking the field. Run on read if a legacy capsule is detected.
- Update filter to: scoped if sessionId matches, global if `null`, otherwise no.
- Add `legacy` as a sentinel session id reserved for migrated data.

### P0-3 Confidence model mismatch (memory.js vs context.js vs assembly.js)

memory.js uses string enum ("high"/"medium"/"low"). context.js uses 0.0–1.0.
assembly.js does `parseFloat(meta.confidence)` → NaN on string → silently no
warning emitted for low-confidence inferred docs.

Fix: unify on 0.0–1.0 numeric. Map at the boundary in memory.js:
- read old `high`/`medium`/`low` → `0.9`/`0.5`/`0.2` on load, persist as numeric.
- New writes are numeric only. VALID_CONFIDENCE removed; replaced by clamp helper.
- Display helper `confidenceLabel(n)` returns "high"/"medium"/"low" for human output.

### P0-4 Two competing context-selection engines

Both assembly.js (`tokenize`/`overlap`/`extractRelevantSections`) and context.js
(`tokenize`/`overlapScore`/`utilityScore`) decide what enters the prompt. Per
review: assembly decides **which level**, context decides **which knowledge**.

Fix: explicit boundary.
- `assembly.js` keeps: N0 policy, N1 project docs (section-matched), N2 task state,
  calls `selectContext` for N3.
- `context.js` keeps: capsule selection (`selectContext`), capsule lifecycle,
  session management, retrieval.
- assembly.js local `tokenize`/`overlap` are kept (cheap, used only for project
  doc section matching which is not the same problem as capsule utility). Comment
  documents the boundary.

## Changes

### assembly.js
- Replace single `spend` with: `reserve(level, text)` for N0/N2, `spend(level, text)`
  for N1/N3. Budget pre-computed: `reserved = cost(N0)+cost(N2)`, `flex = budget - reserved`.
- Add `budget_violation: boolean` to result when reserved > budget; still emit N0.
- Update provenance loop to use numeric confidence only (parseFloat removed).
- Add comment block at top documenting boundary with context.js.

### context.js
- `listCapsules` filter: drop `=== undefined` clause. Accept `null` as global.
- New `migrateLegacyCapsules(root, { dryRun } = {})`: assigns `session_id = "legacy"`
  to capsules with no session_id field. Idempotent.
- Call migration automatically on first read if a legacy capsule is found.
- Reserve `"legacy"` in session id registry (no new session will be generated with
  this id; `getSessionId` returns a uuid, never "legacy").
- Add `ALIASES` map applied during `tokenize` for context selection:
  auth→authentication, db→database, postgres→postgresql, jwt→token, etc.
  Applied only in `tokenize` of context.js (capsule selection); assembly.js
  keeps raw tokens (project doc headings).

### memory.js
- Replace `VALID_CONFIDENCE` Set with `clampConfidence(n)` numeric helper.
- `addDecision`/`addConstraint`/`updateContext`: accept numeric confidence,
  default 0.5. Persist numeric.
- Backward read: if a persisted doc has string confidence, normalize to numeric
  at read time (don't auto-rewrite storage).
- Display helper `confidenceLabel(n)`.

### Tests
- assembly: budget extremes (50, 100, 150 tokens) — N0 must always be present,
  N2 present whenever taskState given, budget_violation flagged when impossible.
- context: legacy capsule with no session_id — must be filtered out of normal
  sessions; only retrievable explicitly by sessionId="legacy".
- context: alias normalization — query "auth" finds "authentication" capsule.
- memory: confidence string vs number — round-trip preserves semantics,
  parseFloat removed.
- assembly: provenance warning emitted for numeric low-confidence docs (the
  current silent-NaN bug must be caught).

### Index.js / SKILL.md
- Update `/wam ctx list` output to show session scoping explicitly (legacy vs
  current).
- No new commands; no new exposed API surface.

## What this change does NOT do

- No embeddings. Aliases are a closed dictionary, not fuzzy match.
- No new dependencies.
- No new files beyond tests.
- No change to selection-log schema.
- No change to N1/N3 selection algorithm (only budget/isolation/confidence).

## Acceptance criteria

1. `node context.test.mjs` — legacy filter, alias normalization pass.
2. `node context-assembly.test.mjs` — budget extremes pass; budget_violation
   surfaced when reserved > budget.
3. `node operational-memory.test.mjs` — confidence numeric round-trip passes.
4. Manual check: a 50-token budget still produces an N0 line in the result.
5. No new files except `*-p0-refactor.test.mjs` (or extension of existing tests).
