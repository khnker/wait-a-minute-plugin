# Design: Context Production

## 1. Context Lifecycle
Context is produced, versioned, refreshed, and curated. The lifecycle:

1. **Produce**: agent emits a context artifact tied to a specific decision or task.
2. **Stamp**: artifact receives `producedAt`, `producer`, `freshnessWindow`, `supersedes` (optional).
3. **Validate**: schema check, link check (no broken refs), size budget.
4. **Curate**: stale artifacts are archived or pruned; canonical artifacts are promoted.
5. **Consume**: downstream agents/sessions read the curated set.

## 2. Context Artifacts
- **Capsule summaries**: compressed views of large files/decisions.
- **Decision logs**: timestamped records of significant choices with rationale.
- **Assumption registers**: tracked assumptions with confidence and expiry.
- **Hypothesis ledgers**: experiments and their outcomes.
- **Glossaries / dictionaries**: domain terms and definitions.

## 3. Production Rules
- Every artifact MUST declare a freshness window (e.g., 24h, until commit, until reviewed).
- Artifacts MUST reference their source (file paths, prior artifact IDs).
- Stale artifacts are NEVER silently consumed; the consumer is told "this is stale".
- Canonical artifacts are the only ones consumable by automated reasoning; non-canonical are explicit "reference only".

## 4. Promotion to Canonical
A context artifact becomes canonical only when:
- Schema valid.
- Links valid.
- Freshness within window OR explicitly re-stamped.
- Reviewed by an authoritative producer (human or trusted pipeline).

## 5. Storage
- Canonical artifacts: `.wam/canonical/`.
- Working/draft artifacts: `.wam/context/draft/`.
- Archived: `.wam/context/archive/` with timestamped filenames.
- Index: `.wam/context/index.json` with metadata for fast lookup.