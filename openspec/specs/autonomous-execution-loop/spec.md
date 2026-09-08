# autonomous-execution-loop Specification

## Purpose
TBD - created by archiving change autonomous-execution-loop. Update Purpose after archive.
## Requirements
### Requirement: Hypothesis-driven experiments
GUARDED mutations MUST carry `hypothesisId`. The execution engine MUST create a hypothesis before opening an experiment.

#### Scenario: GUARDED mutation requires hypothesis
- GIVEN a GUARDED action (e.g., write, edit, bash)
- WHEN the agent attempts to execute it
- THEN the system must require a `hypothesisId` in the arguments
- AND a hypothesis must be created before the experiment

### Requirement: No repetitive failures
The system MUST block any experiment whose `hypothesisId` and `actionDescription` matches a previously failed experiment. The agent MUST replan with a different hypothesis.

#### Scenario: Repetitive failure blocked
- GIVEN an experiment with hypothesis H1 and action A1 has failed
- WHEN the agent tries hypothesis H1 with action A1 again
- THEN `guardAction` returns `allowed: false`
- AND the hypothesis is archived

### Requirement: Risk classification enforced
`guardAction` MUST call `evaluateAction`.
WHEN level is `BLOCKED` THEN `allowed` MUST be false.
SAFE and in-scope GUARDED MAY proceed.

#### Scenario: BLOCKED action blocked
- GIVEN an action is classified as BLOCKED by the risk engine
- WHEN the agent attempts to execute it
- THEN `guardAction` returns `allowed: false` and the action is prevented

### Requirement: Non-destructive deletion (U1)
The system MUST NOT hard-delete cognition records, task sessions, or workspace paths as an autonomous action.
Archive = append status `archived` or move-to-history.
Hard-delete tools and commands (`rm`, `rmdir`, `git reset --hard`, `DROP TABLE`, `TRUNCATE`, shred/unlink) MUST be BLOCKED.

#### Scenario: Hard-delete blocked
- GIVEN the agent attempts to run `rm -rf /path` or `DROP TABLE`
- WHEN `guardAction` evaluates the command
- THEN the action is BLOCKED with reason "hard delete forbidden (U1: soft-archive only)"

### Requirement: Failed hypothesis preserved
Rejected/archived hypotheses MUST remain readable. Silent reuse of a rejected hypothesis is forbidden.

#### Scenario: Archived hypothesis readable
- GIVEN a hypothesis has been archived
- WHEN `listHypotheses` is called
- THEN the archived hypothesis is included in the results with status `archived`
- AND its history is preserved in the append-only JSONL

