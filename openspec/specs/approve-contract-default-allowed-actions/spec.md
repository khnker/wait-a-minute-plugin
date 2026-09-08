# approve-contract-default-allowed-actions Specification

## Purpose
TBD - created by archiving change approve-contract-default-allowed-actions. Update Purpose after archive.
## Requirements
### Requirement: Comprehensive default allowedActions
`approveContract()` MUST persist `approvedStrategy.allowedActions` that includes, at minimum: read, search, inspect, test, lint, typecheck, install dependency, install browser binary, run validation, modify source, create fixture, diagnose, retry, write, edit, bash, sh, task, todowrite, openspec, openspec new change, openspec instructions, openspec validate, openspec archive, git commit, npm test, pnpm test, pnpm install, crear change OpenSpec, ejecutar test suite, instalar dependencia, delegar via Task.

#### Scenario: write/edit/bash in allowedActions after approve
- GIVEN a freshly approved task
- WHEN a tool call uses `write`, `edit`, or `bash`
- THEN `classifyActionAgainstStrategy` MUST return `covered: true`

#### Scenario: openspec commands in allowedActions
- GIVEN a freshly approved task
- WHEN a tool call uses `bash` with command `openspec new change foo`
- THEN `classifyActionAgainstStrategy` MUST return `covered: true`

### Requirement: Guardrails unchanged
The change MUST NOT modify `prohibitedActions` semantics. Destructive operations (`delete production data`, `drop database`, `production deploy`, `credential modification`, `scope expansion`, `destructive operation`) MUST continue to be blocked.

#### Scenario: destructive action still blocked
- GIVEN a freshly approved task with `prohibitedActions` including `"drop database"`
- WHEN a tool call uses `bash` with command `drop database foo`
- THEN `classifyActionAgainstStrategy` MUST return `covered: false`
- AND the strategy violation directive MUST be emitted

