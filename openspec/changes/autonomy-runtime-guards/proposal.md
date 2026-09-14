# Change: Autonomy Runtime Guards

## Objective
Connect autonomous cognitive state with WAM's existing tool interception layer so that GUARDED actions are linked to bounded experiments and cognitive state survives replanning.

## Why
`action-risk-envelope` classified tools. `hypothesis-experiment-loop` added cognitive persistence. Without runtime guards, the two layers don't talk to each other — the agent still fires `write` without creating an experiment first.

## Non-goals
- This change does NOT add an autonomous planner.
- It does NOT force exploration phases.
- It does NOT weaken safety controls.

## Core principle
EXPLORING may include bounded mutation (creating a temp test, instrumenting code, running a reproduction). But only if an experiment exists, the action is reversible, and the blast radius is bounded.
