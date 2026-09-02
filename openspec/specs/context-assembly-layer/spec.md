# context-assembly-layer Specification

## Purpose
TBD - created by archiving change context-assembly-layer. Update Purpose after archive.
## Requirements
### Requirement: Formal four-level context definition

WAM SHALL define four formal context levels with a canonical source, load rule, and prohibition for each.

#### Scenario: Level definition

* GIVEN the runtime loads context for a task
* THEN N0 Global/Policy SHALL be mandatory and minimal
* AND N1 Project SHALL be loaded selectively by task domain
* AND N2 Task SHALL be mandatory (live task state)
* AND N3 Session SHALL be loaded by relevance utility.

### Requirement: Task-driven selection

WAM SHALL select context for the current task instead of loading all available context.

#### Scenario: Unrelated exclusion

* GIVEN task A touches module auth
* AND task B touches module pagos
* WHEN context is assembled for task B
* THEN task A's task-specific context SHALL NOT enter the pack.

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

