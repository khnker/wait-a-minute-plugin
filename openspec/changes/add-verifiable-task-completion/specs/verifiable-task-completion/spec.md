# Spec: verifiable-task-completion

## ADDED Requirements

### Requirement: machine-verifiable completion

El sistema MUST impedir que una tarea llegue a `DONE` cuando exista un requirement con checks obligatorios que no hayan sido verificados.

#### Scenario: requirement has passing verification

- **GIVEN** a task has an approved contract
- **AND** requirement `R1` has a required command check
- **AND** the check exits with code `0`
- **AND** the evidence corresponds to the current repository state
- **WHEN** WAM evaluates the completion gate
- **THEN** `R1` is `VERIFIED`
- **AND** the task may proceed toward `DONE`.

#### Scenario: agent only claims verification

- **GIVEN** requirement `R1` has a required command check
- **WHEN** the agent provides textual evidence claiming the check passed
- **AND** WAM has not executed the check
- **THEN** `R1` MUST NOT become `VERIFIED`.

#### Scenario: verification command fails

- **GIVEN** requirement `R1` has a required check
- **WHEN** the check exits with a non-zero exit code
- **THEN** `R1` MUST remain `VERIFYING`
- **AND** the task MUST NOT become `DONE`.

#### Scenario: verification command times out

- **GIVEN** requirement `R1` has a required check
- **WHEN** the command exceeds its configured timeout
- **THEN** the check result MUST be `TIMEOUT`
- **AND** `R1` MUST remain `VERIFYING`.

#### Scenario: multiple checks

- **GIVEN** requirement `R1` has three required checks
- **AND** two checks pass
- **AND** one check fails
- **WHEN** WAM evaluates the requirement
- **THEN** `R1` MUST NOT be `VERIFIED`.

### Requirement: evidence generation

The Verification Engine MUST generate machine-readable evidence for every executed check.

Evidence MUST include `requirement_id`, `check_id`, `type`, `command`, `cwd`, `exit_code`, `started_at`, `completed_at`, `output_hash` and `repository_state`.

#### Scenario: successful command

- **GIVEN** an approved command check
- **WHEN** WAM executes it successfully
- **THEN** evidence MUST contain exit code `0`
- **AND** an output hash
- **AND** execution timestamps
- **AND** repository state.

### Requirement: repository state binding

Verification evidence MUST be associated with the repository state observed when the check was executed.

#### Scenario: repository changes after verification

- **GIVEN** `R1` is `VERIFIED`
- **WHEN** implementation changes affecting `R1` are made afterwards
- **THEN** the previous verification MUST NOT be sufficient for `DONE`
- **AND** `R1` MUST return to `VERIFYING` or an equivalent unverified state.

### Requirement: approved command boundary

The Verification Engine MUST execute only commands defined by the approved Completion Contract.

#### Scenario: arbitrary textual evidence

- **GIVEN** the agent supplies arbitrary command text as evidence
- **WHEN** WAM receives that evidence
- **THEN** WAM MUST NOT execute the supplied command unless it exists as an approved verification check.

### Requirement: manual evidence

Manual textual evidence MAY be stored, but manual evidence MUST NOT bypass a required machine-verifiable check.

#### Scenario: manual evidence does not verify

- **GIVEN** requirement `R1` has a required command check
- **WHEN** the agent records manual textual evidence
- **THEN** the evidence MAY be stored
- **AND** `R1` MUST NOT become `VERIFIED` on that basis alone.

### Requirement: completion gate

A task MUST NOT transition to `DONE` unless all required requirements are `VERIFIED`, all required verification checks passed, their evidence is valid, and existing completion constraints are satisfied.

#### Scenario: gate allows DONE

- **GIVEN** every requirement is `VERIFIED` with valid evidence
- **AND** existing completion constraints are satisfied
- **WHEN** WAM evaluates the completion gate
- **THEN** the task MAY transition to `DONE`.

#### Scenario: gate blocks DONE on stale evidence

- **GIVEN** a requirement was verified against a previous repository state
- **AND** the repository changed afterwards
- **WHEN** WAM evaluates the completion gate
- **THEN** the task MUST NOT transition to `DONE`.

### Requirement: existing dependency validation

Existing parent/subtask completion validation MUST continue to operate.

A task MUST NOT become `DONE` when required child tasks remain incomplete.

#### Scenario: incomplete child task blocks DONE

- **GIVEN** a parent task with an incomplete required child task
- **WHEN** WAM evaluates the completion gate
- **THEN** the parent task MUST NOT become `DONE`.

### Requirement: bounded execution

The Verification Engine MUST enforce command timeouts.

The Verification Engine MUST bound captured stdout/stderr.

A timeout MUST be treated as verification failure.

#### Scenario: timeout treated as failure

- **GIVEN** a running verification check exceeds its configured timeout
- **WHEN** the engine enforces the timeout
- **THEN** the check result MUST be `TIMEOUT`
- **AND** the requirement MUST remain `VERIFYING`.
