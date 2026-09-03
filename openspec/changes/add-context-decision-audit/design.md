# Context Decision Audit — Design

## Goal

Provide complete auditability and traceability for decisions influenced by context (N0, N1, N2 layers), preventing silent behavioral shifts.

## Data Model

`contract.contextDecisions`: `[{ id, date, source, statement, reason, confidence, status }]`
- `id`: Unique identifier (e.g., `CD1`, `CD2`).
- `date`: Timestamp of decision.
- `source`: Layer origin (`N0_POLICY`, `N1_PROJECT`, `N2_TASK`, `OBSERVED`).
- `statement`: The explicit decision taken.
- `reason`: Rationale/evidence for the decision.
- `confidence`: `high` | `medium` | `low`.
- `status`: `accepted` | `rejected` | `provisional`.

## Architecture & Flow

1. **Context Analysis Hook**: In `engine.js` / `analyze()`, when context heuristics guide contract shape or strategy approval, an entry is generated via `recordContextDecision()`.
2. **State Persistence**: Recorded decisions are merged into `state.contract.contextDecisions`.
3. **CLI Interface**: `/wam audit` lists all context decisions made during the current task/session.
4. **Completion Protection**: Any `provisional` or `low` confidence critical context decision blocks `approveContract` or completion until reviewed or corroborated.
