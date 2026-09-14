## MODIFIED Requirements

### Requirement: Continuation without rebuild

WAM SHALL NOT rebuild the full context pack for continuation messages of an active task.

#### Scenario: Follow-up message

- **GIVEN** a task has an APPROVED contract
- **WHEN** a continuation message arrives
- **THEN** N0 (policy) and N2 (live task delta) SHALL be loaded
- **AND** the previous pack SHALL NOT be reconstructed
- **AND** N1 project context SHALL NOT be re-injected (except every 8 messages)
- **AND** N3 session capsules SHALL NOT be re-injected
- **AND** the contract display SHALL NOT be shown again

#### Scenario: DONE claim triggers full pack

- **GIVEN** a task has an APPROVED contract
- **WHEN** a message contains done/finish/complete keywords
- **THEN** the full context pack (N0+N1+N2+N3) SHALL be assembled
- **AND** the completion gate SHALL be evaluated

#### Scenario: Periodic N1 refresh

- **GIVEN** a task has an APPROVED contract
- **WHEN** 8 continuation messages have been processed
- **THEN** N1 (project context) SHALL be re-injected alongside N0 and N2
- **AND** the refresh interval SHALL be configurable (default: 8 messages)

### Requirement: Pack observability

WAM SHALL report per-level budget usage and selection rationale for every assembled pack.

#### Scenario: Budget report

- **WHEN** a pack is assembled
- **THEN** the pack SHALL expose N0..N3 token usage
- **AND** the total SHALL respect the configured budget
- **AND** continuation packs SHALL report N0+N2 usage (~180 tokens)
