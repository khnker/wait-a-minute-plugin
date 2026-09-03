# Context Decision Audit

## Why

Decisions made based on injected or inferred context (e.g. N0 policies, N1 project context, N2 task state) can drift or silently alter execution paths without explicit tracking. We need an audit trail for context-derived decisions to guarantee transparency, traceability, and enforcement within WAM.

## What Changes

- Introduce a structured audit log for decisions derived from context (`contextDecisions`).
- Track context source, rationale, confidence level, and impact for every decision made by WAM.
- Persist context decisions in task state alongside assumptions and contract requirements.
- Provide a CLI query mechanism (`/wam audit`) to inspect context decisions in real time.
- Validate that critical context-driven decisions are verified prior to contract signoff and completion.

## Non-Goals

- Does not replace standard contract requirements; provides visibility into context rationale behind them.
