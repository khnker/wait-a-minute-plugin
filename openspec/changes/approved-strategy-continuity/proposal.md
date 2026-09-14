# Change: Approved Strategy Continuity

## Objective
Prevent WAM from repeatedly asking for approval for actions that are ordinary execution steps of an already approved strategy.

## Problem
Current behavior can produce:
- User approves strategy
- Agent implements
- Agent runs validation → asks again

## Core rule
> A user approval authorizes a strategy, not a single command. While the agent remains within the approved strategy, the scope, and the autonomy envelope, it MUST continue autonomously. Failure generates a diagnosis obligation; only contradictory evidence invalidates the strategy.

## Scope
In scope: persistent authorization boundary tied to strategy approval.
Out of scope: strategic changes (require new approval), scope expansion, blocked actions.
