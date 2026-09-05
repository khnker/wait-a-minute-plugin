# context-assembly-layer Specification

## Purpose
TBD - created by archiving change context-assembly-layer. Update Purpose after archive.
## Requirements
### Requirement: Formal four-level context definition
The four-level definition MUST partition the budget so N0 and N2 are reserved before any allocation to N1 or N3.

#### Scenario: budget partitions before flex allocation
* GIVEN any budget value
* WHEN assembleContext runs
* THEN N0 and N2 cost SHALL be reserved first
* AND N1 and N3 SHALL consume the remainder

### Requirement: Task-driven selection
Selection within N3 MUST delegate to the context selection engine, which MUST apply a closed alias dictionary during tokenization.

#### Scenario: alias match enables selection
* GIVEN query tokenizes to {auth}
* AND a capsule purpose tokenizes to {authentication, jwt, refresh}
* WHEN selectContext runs
* THEN the capsule SHALL be eligible for inclusion via overlap score > 0

### Requirement: Classification-based loading

WAM SHALL adjust the context pack size and composition based on the pre-flight task classification.

#### Scenario: Trivial task

* WHEN a task is classified trivial
* THEN the pack SHALL contain only N0 and N2
* AND SHALL NOT load project documents or session capsules.

#### Scenario: Architectural task

* WHEN a task is classified architectural or STRICT
* THEN N1 SHALL include architecture, decisions and constraints
* AND the budget SHALL be allowed to grow.

### Requirement: Continuation without rebuild

WAM SHALL NOT rebuild the full context pack for continuation messages of an active task.

#### Scenario: Follow-up message

* GIVEN a task has an APPROVED contract
* WHEN a continuation message arrives
* THEN only N2 (live task delta) SHALL be loaded
* AND the previous pack SHALL NOT be reconstructed.

### Requirement: Prohibited context

WAM SHALL NOT inject ephemeral (L4), superseded capsules or unrelated-project transcripts into any pack.

#### Scenario: Ephemeral exclusion

* GIVEN an L4 ephemeral capsule exists
* WHEN a pack is assembled
* THEN it SHALL be excluded.

### Requirement: Pack observability

WAM SHALL report per-level budget usage and selection rationale for every assembled pack.

#### Scenario: Budget report

* WHEN a pack is assembled
* THEN the pack SHALL expose N0..N3 token usage
* AND the total SHALL respect the configured budget.

### Requirement: Context Budget Reservation
The system SHALL partition the context budget such that N0 (policy) and N2 (task state) are reserved before any allocation to N1 (project) or N3 (session).

#### Scenario: small budget still emits policy
* GIVEN budget is 50 tokens
* WHEN assembleContext runs
* THEN result SHALL contain exactly one N0 line
* AND `budget_violation` SHALL be true when reserved cost exceeds budget

#### Scenario: task state present in N2 under tight budget
* GIVEN budget is 100 tokens AND taskState is provided
* WHEN assembleContext runs
* THEN result SHALL contain N0 and N2 lines
* AND N1/N3 MAY be empty

### Requirement: Session Isolation Strictness
The system SHALL distinguish three session_id states: string uuid (scoped), explicit null (global), and missing field (legacy).

#### Scenario: legacy capsule invisible to new session
* GIVEN a capsule is stored with no session_id field
* WHEN listCapsules is called with a sessionId
* THEN the legacy capsule SHALL be excluded

### Requirement: Confidence Numeric Unification
All confidence values consumed by the context pipeline SHALL be numeric in [0.0, 1.0]. String labels SHALL be normalized at the memory boundary.

#### Scenario: provenance warning emits for numeric low confidence
* GIVEN a decision doc has `confidence: 0.3` and `source: inferred`
* WHEN assembly builds N1
* THEN the N1 provenance warning line SHALL be present

