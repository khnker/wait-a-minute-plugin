# Context Decision Audit

## ADDED Requirements

### Requirement: Explicit context decision recording

Every decision derived from context layers (N0, N1, N2) must be recorded in task state as `{id, date, source, statement, reason, confidence, status}`. MUST be enforced by WAM.

#### Scenario: Decision recorded
- **WHEN** WAM applies a rule or strategy based on context
- **THEN** a structured record is appended to `contract.contextDecisions`

### Requirement: Context audit inspection

Users must be able to inspect the decision audit trail via CLI at any point during task execution.

#### Scenario: Inspect audit trail
- **WHEN** user executes `/wam audit`
- **THEN** all recorded context decisions for the task are returned

### Requirement: Unverified context decision protection

Critical context decisions marked as provisional or low confidence must prevent task completion until verified or accepted.

#### Scenario: Block completion on unverified decision
- **WHEN** a critical context decision remains unverified
- **THEN** completion gate prevents `DONE` status
