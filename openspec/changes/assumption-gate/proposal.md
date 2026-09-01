# Assumption Gate

## Why

Classification and questions still allow a loophole: an agent can silently convert an assumption into an implementation decision ("I assumed X") without WAM blocking it. This is the enforcement layer for the cognitive model.

## What Changes

Enforces the invariant:

```
ASSUMPTION
 ├── non-blocking ──► may proceed, explicitly recorded
 └── decision-critical ──► MUST ASK USER (ASKING)
```

- Assumptions persisted in task state (id, statement, classification, status).
- Active assumption escalating to material impact (data mutation, API behavior, architecture, security, compatibility, scope, destructive action, acceptance criteria) → reclassified `DECISION_CRITICAL` → blocks affected execution → ASKING.
- Evidence (repository inspection) can resolve an assumption → KNOWN, preferring evidence over asking.
- Unresolved decision-critical assumptions block requirement completion, contract approval, task completion and DONE.

## Non-Goals

- Does not eliminate all assumptions; prevents material assumptions from becoming invisible decisions.
