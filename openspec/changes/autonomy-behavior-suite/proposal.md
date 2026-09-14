# Change: Autonomy Behavior Suite

## Problem
WAM contains primitives for autonomous execution (task persistence, completion contracts, risk evaluation, cognition, advisory nextAction, etc.) but the existence of these primitives does not prove that an agent actually behaves autonomously.

## Goal
Introduce a behavioral regression suite that validates WAM preserves an approved strategy across execution, allows autonomous safe actions, investigates failures before changing strategy, uses available evidence and known-good references, and prevents scope drift during autonomous recovery.

## Non-Goals
- Not a planner, not a workflow prescriptor, not domain-specific.
- Not replacing risk-engine or cognition-store.
- Not forcing parallel execution.

## Success metric
> Given an approved strategy and a recoverable failure, does the agent continue solving the problem autonomously without unnecessary user intervention while respecting WAM's risk and scope boundaries?

A regression that causes unnecessary approval requests is a behavioral failure even if all individual unit tests pass.
