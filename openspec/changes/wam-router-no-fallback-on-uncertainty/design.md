# Design: Router Fail-Closed

## Context
Assembly currently falls back to the legacy context selector when the Router produces no capsules. An empty Router result can represent insufficient context, conflict, or unavailable dependencies. Fallback can bypass control decisions.

## Goals / Non-Goals
- Make Router status explicit and machine-readable.
- Prohibit fallback for business-logic "empty" results.
- Allow fallback only for system errors with explicit opt-in compatibility mode.

## Decisions
- `AdapterResult` must include explicit `status` field: `READY`, `EMPTY`, `INSUFFICIENT`, `CONFLICTED`, `ERROR`.
- Fallback is allowed only when `status === ERROR` AND compatibility mode is explicitly enabled.
- Router empty results (no capsules) due to graph semantics are NOT system errors.

## Risks / Trade-offs
- Tasks with genuinely empty context might block indefinitely.
- Legacy compatibility mode is a temporary escape hatch.

## Migration Plan
- Add explicit status to `adaptRouterResult()`.
- Modify Assembly to check `status` instead of `source === "router"`.
- Remove implicit fallback based on capsule count.

## Open Questions
Should a completely empty task (no requirements) return READY or EMPTY?
