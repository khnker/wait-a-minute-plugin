# formal-execution-state Specification

## Purpose
TBD - created by archiving change formal-execution-state. Update Purpose after archive.
## Requirements
### Requirement: Formal state enum
Each task MUST maintain a `state` field taking one of: `INITIALIZING`, `INVESTIGATING`, `EXECUTING`, `VERIFYING`, `COMPLETED`, `BLOCKED`, `WAITING_AUTHORIZATION`, `FAILED`.

#### Scenario: valid state persisted
- GIVEN a task with `phase: "PROPOSED"` and no `state` field
- WHEN `migrateLegacyPhase("PROPOSED")` runs
- THEN it MUST return `"INVESTIGATING"`

### Requirement: Strict transition table
State transitions MUST only proceed between documented pairs. Invalid transitions MUST throw an error.

#### Scenario: INITIALIZING → INVESTIGATING valid
- GIVEN `state = "INITIALIZING"`
- WHEN `transition("INITIALIZING", "INVESTIGATING")` runs
- THEN it MUST return `"INVESTIGATING"`

#### Scenario: INITIALIZING → COMPLETED invalid
- GIVEN `state = "INITIALIZING"`
- WHEN `transition("INITIALIZING", "COMPLETED")` runs
- THEN it MUST throw `"Invalid transition: INITIALIZING → COMPLETED"`

### Requirement: Legacy phase migration
Tasks persisted with a legacy `phase` string (ASKING, PROPOSED, IMPLEMENTING, VERIFYING, DONE) MUST be migrated to the corresponding formal state on read.

#### Scenario: ASKING maps to WAITING_AUTHORIZATION
- GIVEN `phase: "ASKING"`
- WHEN `migrateLegacyPhase("ASKING")` runs
- THEN it MUST return `"WAITING_AUTHORIZATION"`

### Requirement: /wam status command
`/wam status [taskId]` MUST output a structured report showing: state, strategy, current hypothesis, experiments, failures, pending authorization, verification status, completion evidence.

#### Scenario: status shows all fields
- GIVEN a task in state EXECUTING
- WHEN `/wam status` runs
- THEN output MUST include `state: EXECUTING` and `strategy:` and `experiments:` and `verification status:`

