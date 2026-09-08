# Proposal: strategy-reset-command

## Why
If `approvedStrategy.strategy` was persisted as `"unspecified"` or got corrupted, the only fix today is to re-run `approveContract`, which is heavy and may have side effects on the contract status. There is no surgical command to update only the strategy scope.

## What Changes
- Add `/wam strategy set <scope...>` command in `wamCli` (index.js ~line 1017).
- The command MUST update only `state.approvedStrategy.strategy` and `state.approvedStrategy.scope`. Status, allowedActions, prohibitedActions, invalidationConditions MUST remain unchanged.

## Scope
- `index.js` (`wamCli`)

## Non-Goals
- Editing `allowedActions` or `prohibitedActions` (covered by separate change)
- Editing `status` (covered by separate change)
- Bulk/remote strategy management
