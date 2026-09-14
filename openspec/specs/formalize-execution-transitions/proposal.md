# Proposal: Formalize Execution Transitions

## Why

Execution phases are currently represented by assignments distributed through runtime code. As autonomy gains replanning, authorization, blocking, and review, implicit transitions become difficult to reason about and easy to violate.

## What changes

Introduce a centralized execution transition model with explicit states and valid transitions.

## Target states

- PROPOSED
- ASKING
- IMPLEMENTING
- REPLANNING
- VERIFYING
- REVIEWING
- DONE
- BLOCKED
- WAITING_AUTHORIZATION

## Non-goals

- The state machine SHALL NOT become a planner.
- It SHALL NOT dictate which experiment or tool the agent chooses.
- It SHALL only enforce lifecycle invariants.
