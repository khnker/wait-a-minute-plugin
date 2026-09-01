# Blocking Questions

## Why

Classification alone (change `decision-critical-uncertainty`) identifies blocking uncertainties but does not define how the agent interacts with the user. Without an explicit state, the agent may still pick an answer or ask vague clarification.

## What Changes

Adds an explicit `ASKING` lifecycle state so decision-critical uncertainty results in a targeted, persisted user question instead of an autonomous assumption.

```
PROPOSED
 │
 ├── blocking uncertainty ──► ASKING
 │                              │
 │                              ▼
 │                           ANSWERED
 │                              │
 │                              ▼
 │                           PROPOSED
 │
 └── no blocking uncertainty
     │
     ▼
  APPROVED
```

## Impact

- Lifecycle: PROPOSED → ASKING → ANSWERED → PROPOSED → APPROVED.
- Persisted `questions` in task state (id, question, status, blocks[]).
- Hook instructs the agent to ask a targeted actionable question (options when derivable), never implement the blocked decision.
- Answers resolve the question, update the contract, return to PROPOSED, require re-approval if material.

## Non-Goals

- No general conversational clarification framework.
- Scope limited to questions required to safely execute WAM-managed tasks.
