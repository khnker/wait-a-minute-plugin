# Proposal: formal-execution-state

## Why
The task lifecycle is currently implicit: `phase` is a free-form string scattered across `index.js` and `engine.js`. There are no formal transitions between INITIALIZING → INVESTIGATING → EXECUTING → VERIFYING → COMPLETED, and the side-states BLOCKED / WAITING_AUTHORIZATION / FAILED are not enumerated. There is no `/wam status` command to observe the current state, strategy, hypothesis, experiments, failures, pending authorization, and verification status in one place.

## What Changes
- Introduce a `state` field on each task, separate from `phase`, that takes one of: `INITIALIZING`, `INVESTIGATING`, `EXECUTING`, `VERIFYING`, `COMPLETED`, `BLOCKED`, `WAITING_AUTHORIZATION`, `FAILED`.
- Add a `status` accessor `/wam status [taskId]` that prints the formal state plus: strategy, current hypothesis, recent experiments, failures, pending authorization, verification status, completion evidence.
- The transition function MUST only allow documented transitions and reject invalid ones with a clear error.

## Scope
- `index.js` (state accessor, `/wam status`)
- `engine.js` (state transitions)
- New: `execution-state.js` (transition table)

## Non-Goals
- Per-tool state tracking
- Multi-task parallel state machines
- Distributed consensus over state
