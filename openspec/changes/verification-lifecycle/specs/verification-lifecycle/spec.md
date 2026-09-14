# Spec: verification-lifecycle

## ADDED Requirements

### Requirement: Verification state machine
Each requirement MUST maintain a verification state: `UNVERIFIED`, `VERIFYING`, `VERIFIED`, or `FAILED`. Transitions MUST be explicit.

#### Scenario: UNVERIFIED → VERIFYING
- GIVEN requirement with `verificationStatus: "UNVERIFIED"`
- WHEN verification starts
- THEN `verificationStatus` MUST be `"VERIFYING"`

#### Scenario: VERIFYING → VERIFIED
- GIVEN requirement with `verificationStatus: "VERIFYING"` and evidence array non-empty
- WHEN verification succeeds
- THEN `verificationStatus` MUST be `"VERIFIED"`

#### Scenario: VERIFYING → FAILED
- GIVEN requirement with `verificationStatus: "VERIFYING"` and evidence array empty
- When verification fails
- Then `verificationStatus` MUST be `"FAILED"`

### Requirement: Evidence linked to requirement
Each verified requirement MUST have at least one evidence item. Evidence MUST include: method (test/lint/build/other), result (pass/fail), details (hash or output snippet).

#### Scenario: verified requirement has evidence
- GIVEN requirement with `verificationStatus: "VERIFIED"`
- WHEN evidence is recorded
- Then evidence array MUST have length >= 1
- And each evidence item MUST include `method`, `result`, and `details`

### Requirement: COMPLETED gated on verification
`COMPLETED` state MUST only be allowed when all requirements have `verificationStatus: "VERIFIED"` and evidence count >= 1 for each.

#### Scenario: COMPLETED blocked with unverified requirements
- GIVEN task with 2 requirements, one "VERIFIED" one "UNVERIFIED"
- When `transition("VERIFYING", "COMPLETED")` runs
- Then it MUST throw `"Cannot complete: 1 unverified requirement(s)"`

#### Scenario: COMPLETED allowed with all verified
- GIVEN task with 2 requirements, both "VERIFIED" with evidence
- When `transition("VERIFYING", "COMPLETED")` runs
- Then it MUST return `"COMPLETED"`
