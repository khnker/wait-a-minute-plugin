# Blocking Questions

## ADDED Requirements

### Requirement: Ask instead of assume

When pre-flight identifies a `DECISION_CRITICAL` uncertainty that cannot be resolved through investigation, WAM must instruct the agent to ask the user a targeted question. The agent must not implement the affected decision. MUST be enforced by WAM.

#### Scenario: Blocking uncertainty
- **WHEN** a task enters `ASKING` due to a decision-critical uncertainty
- **THEN** the agent is instructed to ask the user instead of implementing the blocked decision

### Requirement: Questions must be actionable

Questions must identify the exact unresolved decision, explain why it matters when necessary, and provide concrete options when derivable. Must not ask for information already available in the repository. MUST be enforced by WAM.

#### Scenario: Actionable question
- **WHEN** a question is emitted for a pending decision
- **THEN** it identifies the decision and provides concrete options when derivable

### Requirement: Minimize questions

Ask the smallest set of questions required to unblock execution. Group related decisions sharing the same user decision. MUST be enforced by WAM.

#### Scenario: Grouped decisions
- **WHEN** multiple unknowns share a single user decision
- **THEN** they are grouped into one question

### Requirement: Preserve question state

Pending questions persist with the task as `{id, question, status: pending, blocks: [requirementIds]}`. MUST be enforced by WAM.

#### Scenario: Persisted question
- **WHEN** a task enters `ASKING`
- **THEN** the pending question is persisted with the task state

### Requirement: Resume after answer

On answer: associate the answer with the question, resolve the uncertainty, update the contract, return to `PROPOSED`, and require approval again if the answer changes the contract materially. MUST be enforced by WAM.

#### Scenario: Answer resolves blocking
- **WHEN** the user answers a pending question
- **THEN** the corresponding uncertainty is resolved, the contract updates, and the task returns to `PROPOSED`

### Requirement: No execution while ASKING

While `ASKING`, WAM must prevent the agent from proceeding with the blocked decision. Unrelated read-only investigation may continue only if it helps resolve the question. MUST be enforced by WAM.

#### Scenario: Blocked execution
- **WHEN** a task is in `ASKING`
- **THEN** the blocked requirement cannot be implemented until the question is answered

## MODIFIED Requirements

### Requirement: Task lifecycle

The lifecycle gains `ASKING` and `ANSWERED`: `PROPOSED → ASKING → ANSWERED → PROPOSED → APPROVED`. MUST be enforced by WAM.

#### Scenario: Enter ASKING
- **WHEN** a blocking decision-critical uncertainty exists
- **THEN** the task transitions from `PROPOSED` to `ASKING`

#### Scenario: Exit ASKING
- **WHEN** the user answers the pending question
- **THEN** the task transitions `ASKING → ANSWERED → PROPOSED`

#### Scenario: Fast path preserved
- **WHEN** a task has no blocking uncertainty
- **THEN** it keeps the current continuation fast path without entering `ASKING`
