# Clarification Gate

## ADDED Requirements

### Requirement: Hard block on execution while asking

While a task is in `ASKING` phase, WAM must block execution of mutating tools (write, edit, bash, task delegation, PTY). MUST be enforced by WAM in `tool.execute.before`.

#### Scenario: Implementation tool blocked during ASKING
- **WHEN** a task is in `ASKING` phase and the agent attempts a mutating tool call
- **THEN** the tool call is aborted with a directive naming the pending blocking question

#### Scenario: Investigation still allowed during ASKING
- **WHEN** a task is in `ASKING` phase and the agent attempts a read-only tool call (read, grep, glob, docs, graph)
- **THEN** the tool call proceeds (repository inspection is preferred over asking)

### Requirement: Natural-language answer recognition

When a task is in `ASKING` phase, a non-command user message MUST be recognized as the answer to the pending blocking question: the unknown resolves, the associated assumption resolves, the phase transitions out of `ASKING`, and a confirmation is emitted before any implementation. MUST be enforced by WAM.

#### Scenario: Answer re-enters WAM
- **WHEN** the user replies to a blocking question with plain text
- **THEN** the unknown is resolved with that text, the assumption becomes resolved, the task leaves `ASKING`, and a `✓ question answered / ready` confirmation is emitted

### Requirement: Fast-path never bypasses ASKING

A task in `ASKING` phase MUST NOT take the continuation fast-path, even if its contract is APPROVED. MUST be enforced by WAM.

#### Scenario: Approved task with pending question
- **WHEN** a task has an APPROVED contract but is in `ASKING` phase
- **THEN** the continuation fast-path is skipped and the pending question is re-presented

### Requirement: Full loop closure

Answering the blocking question MUST re-enter WAM evaluation (assumption re-evaluation) and resume at the contract step, never silently resuming execution. MUST be enforced by WAM.

#### Scenario: Answer → re-evaluation → ready
- **WHEN** the answer resolves the last blocking question
- **THEN** WAM re-evaluates assumptions, updates the contract context and emits `question answered · assumption resolved · contract updated · ready → proceed`
