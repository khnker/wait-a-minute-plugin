# Change: Integrate Autonomy Runtime

## Why
WAM contains the building blocks (cognition-store, risk-engine, advisory nextAction, persistent state) but they are not yet connected into a closed runtime loop.

## Goal
Close the loop: cognition → runtime → context → agent → experiment → observation → replan.

## Out of scope
- No planner.
- No forced workflow.
- No automatic retry of failed actions.
- No autonomous production deployment.

## Acceptance
- Cognitive state injected into agent context (compact form).
- BLOCKED actions cannot execute (WamPolicyBlock).
- Paths canonicalized (no /repo/project-evil bypass).
- `task` tool classified as GUARDED.
- Failed experiments return control to agent (no auto-retry).
- DONE remains evidence-based.
