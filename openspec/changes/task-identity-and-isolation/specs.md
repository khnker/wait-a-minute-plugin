# Specs: Task Identity and Isolation

## Spec: Task Identity Resolution
### Requirement: Explicit Task Precedence
The engine must prioritize explicit `taskId` provided in the input over any heuristic or duplicate detection.
#### Scenario: Explicit Task ID Wins
- Given an active task A and a prompt similar to task A
- When an input arrives with `taskId: "task-B"`
- Then the engine must resolve to `task-B` without triggering duplicate reassignment.

### Requirement: Session Isolation
Sessions must not leak task state across different session IDs.
#### Scenario: Cross-Session Isolation
- Given session A is bound to task A
- When session B sends a prompt
- Then session B must not automatically inherit task A without explicit session binding or resume command.

### Requirement: Decoupled Duplicate Detection
Duplicate detection must propose candidates rather than forcing identity takeover.
#### Scenario: Duplicate Candidate Suggestion
- Given an existing task in progress
- When a similar prompt arrives without an explicit task ID in a new session
- Then the engine detects a duplicate candidate but requires explicit continuation evidence before takeover.
