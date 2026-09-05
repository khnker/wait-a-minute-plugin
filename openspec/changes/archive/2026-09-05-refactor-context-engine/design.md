# Design — refactor-context-engine

## Architecture

Two-engine split is preserved; only the boundary is made explicit and the
budget/isolation/confidence invariants are tightened.

```
USER PROMPT
   │
   ▼
assembleContext  (assembly.js)            ← Context Pack Builder
   │
   ├── N0: POLICIES (reserved)            ← budget reservation
   ├── N1: project docs (section match)   ← uses local tokenize/overlap
   ├── N2: task state (reserved)          ← budget reservation
   └── N3: selectContext(prompt, ...)     (context.js)
              │                            ← Context Selection Engine
              ├── L1 base (importance)
              ├── L2/L3 by utility        ← uses local tokenize/overlap
              └── aliases applied
```

Two tokenize implementations exist by design:
- assembly.js: project-doc heading + body overlap (small, deterministic, no
  aliases — project docs use canonical names).
- context.js: capsule purpose/scope/content overlap (closed alias dictionary).

## Budget reservation

```js
const costN0 = estTokens(POLICY_LINE);
const costN2 = estTaskspendFor(taskState);  // pre-computed
const reserved = costN0 + costN2;
const flex = budget - reserved;

const reserve = (level, text) => { /* append unconditionally */ };
const spend = (level, text) => {
  if (used + estTokens(text) > flex) { rationale.push(...); return; }
  levels[level].push(text); used += estTokens(text);
};
reserve("N0", POLICY_LINE);
reserve("N2", taskLine);
const budget_violation = reserved > budget;
```

## Session isolation

```js
// context.js
const matches = (c, sessionId) => {
  if (c.session_id == null) return sessionId == null;  // global only via null
  return c.session_id === sessionId;
};
// listCapsules filter:
.filter((c) => !sessionId || matches(c, sessionId))
```

Migration is a separate explicit step:
```js
migrateLegacyCapsules(root) {
  // walks .wam/capsules/*.json
  // for any file lacking session_id, writes { session_id: "legacy" }
  // idempotent
}
```

Called explicitly from `/wam ctx migrate` command (new, single-purpose) and from
a one-shot bootstrap hook in `index.js` if `--migrate-legacy` flag present.
Default: not auto-run on every read (avoids write-amplification).

## Confidence unification

memory.js boundary:
```js
const CONFIDENCE_MAP = { high: 0.9, medium: 0.5, low: 0.2 };
function normalizeConfidence(v) {
  if (typeof v === "number") return clamp(v, 0, 1);
  if (typeof v === "string") return CONFIDENCE_MAP[v] ?? 0.5;
  return 0.5;
}
function confidenceLabel(n) {
  return n >= 0.7 ? "high" : n >= 0.4 ? "medium" : "low";
}
```

Read path: normalize before passing to consumers.
Write path: store numeric only (no auto-rewrite of legacy string docs).

## Alias dictionary

```js
const ALIASES = {
  auth: "authentication",
  db: "database",
  postgres: "postgresql",
  postgresql: "postgres",
  jwt: "token",
  ts: "typescript",
  py: "python",
  k8s: "kubernetes",
  api: "interface",
  ui: "frontend",
};
```

Applied as a second pass after `tokenize()` in context.js only. Synonyms go both
ways (postgres↔postgresql) to avoid asymmetric bias. Closed set; no fuzzy match.

## Risks and trade-offs

- **Backwards compatibility**: existing string-confidence docs keep working
  (normalized on read). Tests verify round-trip.
- **Migration safety**: `migrateLegacyCapsules` writes to disk; runs idempotently
  with a `--dry-run` flag exposed via `/wam ctx migrate --dry-run`.
- **Alias dictionary is opinionated**: kept narrow. New aliases added only when
  a test demonstrates a real false-negative.
- **Two tokenize implementations**: deliberate. Combining them risks coupling
  assembly to capsule semantics. The boundary comment is the contract.
