# Assumption Gate

## ADDED Requirements

### Requirement: Explicit assumptions

When the agent proceeds using an assumption, it must be represented in task state as `{id, statement, classification, status}`. MUST be enforced by WAM.

#### Scenario: Assumption recorded
- **WHEN** the agent proceeds on an assumption
- **THEN** the assumption is persisted in task state

### Requirement: Detect assumption escalation

If an active assumption becomes relevant to data mutation, API behavior, architecture, security, compatibility, scope, destructive action or acceptance criteria, WAM must reclassify it as `DECISION_CRITICAL`. MUST be enforced by WAM.

#### Scenario: Escalated assumption
- **WHEN** an active `NON_BLOCKING` assumption becomes relevant to material impact
- **THEN** it is reclassified `DECISION_CRITICAL`

### Requirement: Block affected execution

A decision-critical assumption must block execution of the affected requirement. MUST be enforced by WAM.

#### Scenario: Blocked by assumption
- **WHEN** a decision-critical assumption is active
- **THEN** execution of the affected requirement is blocked and the task enters `ASKING`

### Requirement: Evidence can resolve assumptions

An assumption may become a known fact when supported by evidence. Repository inspection is preferred over asking the user. MUST be enforced by WAM.

#### Scenario: Evidence resolves assumption
- **WHEN** repository evidence supports an assumption
- **THEN** the assumption converts to a known fact without user interaction

### Requirement: Completion protection

An unresolved decision-critical assumption must prevent requirement completion, contract approval, task completion and `DONE`. MUST be enforced by WAM.

#### Scenario: Gate blocks completion
- **WHEN** a task claims completion while a decision-critical assumption is unresolved
- **THEN** the completion gate blocks the claim

#### Scenario: Approval blocked
- **WHEN** a contract has an unresolved decision-critical assumption
- **THEN** the contract cannot be approved
