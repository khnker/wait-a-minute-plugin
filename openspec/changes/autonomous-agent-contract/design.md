# Design: Autonomous Agent Contract

## Objective
Provide clear, actionable guidance to the agent on how to behave autonomously within the defined safety envelope.

## Contract Components
- **Core Principle**: WAM controls boundaries; agent controls strategy.
- **Autonomy Expectation**: The agent is expected to investigate, hypothesize, experiment, and re-plan autonomously for SAFE actions.
- **Advisory NextAction**: Explicit instruction that `nextAction` is advisory, not mandatory.
- **Escalation Trigger**: Explicit guidance on when to escalate to the user (only when SAFE investigation fails or action is BLOCKED).
- **Completion Criteria**: Completion remains evidence-based (not traversal-based).

## Implementation
- Modify `prepareSystemInject` to append the autonomy contract as a system instruction at the end of the context pack.
