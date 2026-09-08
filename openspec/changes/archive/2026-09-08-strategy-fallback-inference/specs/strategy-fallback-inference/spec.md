# Spec: strategy-fallback-inference

## ADDED Requirements

### Requirement: No unspecified strategy
The system MUST NOT persist `approvedStrategy.strategy` as the empty string, `"unspecified"`, or `null`.

#### Scenario: empty objective infers from requirements
- GIVEN a task state with `contract.objective` empty, `intent.goal` empty, `requirements[0].title = "Modernizar escrapper"`
- WHEN `approveContract(taskId)` runs
- THEN `approvedStrategy.strategy` MUST equal `"Modernizar escrapper"` (or its 100-char prefix)

#### Scenario: empty objective and no requirements infers from lastAction
- GIVEN a task state with `contract.objective` empty, `intent.goal` empty, `requirements` empty, `lastAction = "fix parser bug in src/normalize.ts"`
- WHEN `approveContract(taskId)` runs
- THEN `approvedStrategy.strategy` MUST equal `"fix parser bug in src/normalize.ts"` (or its 100-char prefix)

#### Scenario: objective present uses objective
- GIVEN `contract.objective = "Refactor: state machine"`
- WHEN `approveContract(taskId)` runs
- THEN `approvedStrategy.strategy` MUST equal `"Refactor: state machine"` (objective takes precedence)
