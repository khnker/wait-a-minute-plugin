# Proposal: strategy-fallback-inference

## Why
`approveContract()` persists `strategy: "unspecified"` when `state.contract?.objective` and `state.intent?.goal` are both empty. This breaks `classifyActionAgainstStrategy`, which returns `covered: false` for every action because no strategy text matches.

## What Changes
- In `approveContract` (index.js ~line 1527): if `state.contract?.objective` and `state.intent?.goal` are both empty, infer the strategy name from `state.requirements[0].title` (first 100 chars) or `state.lastAction` (first 100 chars).
- The system MUST NEVER persist `strategy: "unspecified"` or `strategy: ""`.

## Scope
- `index.js` (`approveContract`)

## Non-Goals
- New persistence format (existing state.yaml preserved)
- Auto-inference of allowedActions (covered by separate change)
- Auto-inference of prohibitedActions
