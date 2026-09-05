# Context Assembly Layer — Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
