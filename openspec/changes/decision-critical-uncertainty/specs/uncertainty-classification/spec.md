# Uncertainty Classification

## ADDED Requirements

### Requirement: Classify uncertainty

During pre-flight, every material `UNKNOWN` or `ASSUMED` must be classified as one of: `RESOLVABLE`, `NON_BLOCKING`, `DECISION_CRITICAL`. Classification is deterministic and rule-based. MUST be enforced by WAM.

#### Scenario: Destructive decision clause
- **WHEN** an uncertainty mentions migration-or-deletion, deletion scope or data loss
- **THEN** it is classified `DECISION_CRITICAL`

#### Scenario: Repository-inspectable question
- **WHEN** an uncertainty asks about existing repo facts (stack, config, endpoints, tests, docs)
- **THEN** it is classified `RESOLVABLE`

#### Scenario: Cosmetic or preference question
- **WHEN** an uncertainty has no material impact
- **THEN** it is classified `NON_BLOCKING`

### Requirement: Resolve before asking

If an uncertainty can be resolved through repository inspection, existing code, configuration, tests, documentation or available tools, the agent must investigate before asking the user. MUST be enforced by WAM.

#### Scenario: Resolvable uncertainty
- **WHEN** pre-flight classifies an uncertainty `RESOLVABLE`
- **THEN** the agent investigates the repository instead of asking the user

### Requirement: Decision-critical blocking

A `DECISION_CRITICAL` uncertainty must prevent implementation of the affected decision until the user provides an answer. MUST be enforced by WAM.

#### Scenario: Contract exposes blocking unknown
- **WHEN** a contract contains a `DECISION_CRITICAL` uncertainty with status `blocking`
- **THEN** the contract cannot transition to `APPROVED`

#### Scenario: DONE blocked by unknown
- **WHEN** a task claims DONE while its contract has a blocking unknown
- **THEN** the completion gate blocks the claim

### Requirement: Non-blocking assumptions remain explicit

Non-blocking assumptions may be made autonomously but must remain explicitly represented as assumptions and never silently promoted to facts. MUST be enforced by WAM.

#### Scenario: Non-blocking assumption
- **WHEN** an assumption is classified `NON_BLOCKING`
- **THEN** it stays listed in the task's assumptions and does not block execution

## MODIFIED Requirements

### Requirement: Completion Contract

Completion Contracts now expose unresolved decision-critical uncertainties (`unknowns` with id, question, classification, status). MUST be enforced by WAM.

#### Scenario: Unknowns round-trip in state
- **WHEN** a contract with blocking unknowns is persisted
- **THEN** `state.yaml` preserves the `unknowns` array and the persisted contract blocks approval

#### Scenario: No-uncertainty regression
- **WHEN** a task has no uncertainties
- **THEN** its lifecycle behaves exactly as before this change
