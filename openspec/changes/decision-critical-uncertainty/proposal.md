# Decision Critical Uncertainty

## Why

WAM's cognitive model separates KNOWN / INFERRED / ASSUMED / UNKNOWN, but identifying an UNKNOWN does not determine what the agent must do with it. An agent can detect `UNKNOWN: existing records should be migrated or deleted` and still proceed via UNKNOWN → ASSUME → IMPLEMENT, converting a material uncertainty into a unilateral decision.

This change evolves the model to distinguish uncertainties the agent may resolve autonomously from those requiring an explicit user decision.

## What Changes

Pre-flight analysis classifies every material UNKNOWN/ASSUMED as one of:

- `RESOLVABLE` — can be answered via repository inspection, existing code, configuration, tests, documentation or available tools → agent investigates first.
- `NON_BLOCKING` — may proceed autonomously, but stays explicitly represented as an assumption (never silently promoted to fact).
- `DECISION_CRITICAL` — choosing an answer can materially affect behavior, data, architecture, security, compatibility, scope, destructive operations, user-visible behavior or acceptance criteria → blocks implementation of the affected decision until the user answers.

Completion Contracts expose unresolved decision-critical uncertainties and must not transition to APPROVED while one is blocking.

## Impact

- `engine.js`: classification of unknowns/assumptions in pre-flight output.
- `index.js`: contract carries `unknowns` (id, question, classification, status).
- Gate: contract with blocking DECISION_CRITICAL uncertainty cannot be APPROVED.
- Existing tasks without uncertainty behave exactly as before.

## Non-Goals

- No user-question interaction/state machine (next change: `blocking-questions`).
- No new LLM or external service.
