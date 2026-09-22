# production-integrity Specification

## Purpose
TBD - created by archiving change production-integrity-hardening. Update Purpose after archive.
## Requirements
### Requirement: Explicit task identity precedence

An explicit `taskId` in the command payload MUST take precedence over `findDuplicateTask` suggestions. MUST be enforced in `runtime/message-handler.js` and `index.js`.

#### Scenario: Explicit taskId wins
- **WHEN** a command provides `taskId` AND duplicate detection returns a different task
- **THEN** the explicit taskId is used, duplicate result is ignored

#### Scenario: Duplicate detection as fallback
- **WHEN** no explicit `taskId` is provided AND duplicate detection finds a match
- **THEN** duplicate suggestion is used as candidate

### Requirement: Session-bound active task

Active task storage MUST be scoped per `(sessionId, projectRoot)`. `readActiveTaskIdFresh` MUST validate both sessionId and projectRoot ownership before returning a task.

#### Scenario: Session isolation
- **WHEN** session A sets active task and session B reads active task
- **THEN** session B sees no active task from session A

#### Scenario: Project root isolation
- **WHEN** same sessionId in different projectRoot sets different active tasks
- **THEN** each projectRoot sees only its own active task

### Requirement: Evidence structural validity

`verifyEvidence` MUST require full lineage before marking evidence `valid`. Full lineage = `requirementId`, `hypothesisId`, `experimentId`, AND `observationId` all present.

#### Scenario: Full lineage evidence
- **WHEN** evidence has all four lineage fields and verification result is PASS
- **THEN** evidence status is `valid`

#### Scenario: Missing lineage evidence
- **WHEN** any lineage field is missing and verification result is PASS
- **THEN** evidence status is `insufficient`

### Requirement: Deterministic evidence ordering

`getAllEvidence` MUST sort by `Date.parse(createdAt)` ascending, with deterministic ID tiebreak. MUST NOT use ISO string subtraction.

#### Scenario: Distinct timestamps
- **WHEN** evidence has distinct createdAt values
- **THEN** results are ordered oldest first

#### Scenario: Equal timestamps
- **WHEN** evidence has identical createdAt values
- **THEN** tiebreak is by ID (stable, deterministic)

### Requirement: Verification check integrity

`evaluateRequirement` MUST enforce 1:1 check_id mapping. Duplicate check_ids, unknown check_ids, or missing check_ids MUST fail verification.

#### Scenario: 1:1 mapping
- **WHEN** each check has a unique known check_id
- **THEN** verification proceeds normally

#### Scenario: Duplicate check_id
- **WHEN** two checks share the same check_id
- **THEN** verification fails with mapping error

### Requirement: Completion gate supersession

`getCompletionStatus` MUST prefer the latest valid evidence and ignore stale/invalidated evidence.

#### Scenario: Valid evidence overrides stale
- **WHEN** latest evidence for a requirement is valid and older evidence is stale
- **THEN** requirement is satisfied

#### Scenario: Only stale evidence
- **WHEN** all evidence for a requirement is stale
- **THEN** requirement is unsatisfied

### Requirement: Context router evidence inclusion

Context router `requiredClosure` MUST include `requires_completion` and `requires_output` edges. Evidence supporting a requirement via `supports` edge MUST be included in closure.

#### Scenario: Requires_completion edge
- **WHEN** requirement has requires_completion edge to another node
- **THEN** target node is in requiredClosure

#### Scenario: Evidence supports requirement
- **WHEN** evidence is linked to requirement via supports edge
- **THEN** evidence is included in closure for that requirement

### Requirement: Repository hygiene

- `node_modules/` MUST be in `.gitignore`
- No hardcoded debug `console.log` in production code (`engine.js`)
- No duplicate `"type": "module"` in `package.json`

#### Scenario: node_modules ignored
- **WHEN** git status is checked
- **THEN** node_modules/ is not listed

