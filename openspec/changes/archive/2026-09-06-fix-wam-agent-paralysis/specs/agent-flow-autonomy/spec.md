## ADDED Requirements

### Requirement: Continuation detection
WAM SHALL detect continuation messages and apply轻量级 injection instead of full pre-flight analysis.

#### Scenario: Approved task continuation
- **WHEN** a message arrives AND contract status is APPROVED AND message does NOT contain done/finish/complete keywords AND message is NOT a /wam command
- **THEN** WAM SHALL inject ONLY the N2 task state line
- **AND** WAM SHALL NOT inject N0 policies, N1 project, N3 capsules, or contract display
- **AND** WAM SHALL NOT re-run the full analyze() pipeline

#### Scenario: DONE claim triggers full gate
- **WHEN** a message arrives AND contract status is APPROVED AND message contains done/finish/complete keywords
- **THEN** WAM SHALL run applyCompletionGate() to verify requirements are met
- **AND** if gate blocks, WAM SHALL inject the blocking directive

### Requirement: First-message contract display
WAM SHALL display the full contract (Objective, Etapas, Verificación) only on the first message of a task.

#### Scenario: New task gets contract display
- **WHEN** a message arrives AND no task state exists for the effective taskId
- **THEN** WAM SHALL display the full contract with objective, stages, and verification criteria

#### Scenario: Continuation skips contract display
- **WHEN** a message arrives AND task state exists AND contract status is PROPOSED or APPROVED
- **AND** this is NOT the first message (state already persisted)
- **THEN** WAM SHALL NOT display the full contract block

### Requirement: Completion gate on DONE claims only
WAM SHALL only evaluate the completion gate when the agent explicitly claims task completion.

#### Scenario: Non-DONE message skips gate
- **WHEN** a continuation message arrives AND contract is APPROVED
- **AND** message does NOT contain done/finish/complete/declare done
- **THEN** WAM SHALL skip applyCompletionGate() entirely

#### Scenario: DONE claim triggers gate
- **WHEN** a message contains "done" or "finish" or "complete" or "declare done"
- **THEN** WAM SHALL run applyCompletionGate() to verify all requirements are satisfied

### Requirement: Trivial task minimal injection
For tasks classified as trivial/FAST, WAM SHALL inject only the minimal N0 policy line without full contract display.

#### Scenario: Trivial task gets minimal injection
- **WHEN** a task is classified as trivial AND mode is FAST
- **THEN** WAM SHALL inject only: `[wam N0 policy] scope(ACTIVE) | verify(ACTIVE) | simplify(ACTIVE)`
- **AND** WAM SHALL NOT inject contract display, N1 project, N2 task, or N3 capsules
