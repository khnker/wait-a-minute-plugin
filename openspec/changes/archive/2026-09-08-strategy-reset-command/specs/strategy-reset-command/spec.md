# Spec: strategy-reset-command

## ADDED Requirements

### Requirement: /wam strategy set updates scope
The `/wam strategy set <scope...>` command MUST update `approvedStrategy.strategy` and `approvedStrategy.scope` to the provided scope text, leaving all other `approvedStrategy` fields intact.

#### Scenario: set updates strategy and scope
- GIVEN `approvedStrategy = { strategy: "old", scope: "old", status: "ACTIVE", allowedActions: [...], prohibitedActions: [...] }`
- AND task state has `contract.status === "APPROVED"`
- WHEN `/wam strategy set modernizar scrapper-eltarro con OpenSpec` runs
- THEN `approvedStrategy.strategy` MUST equal `"modernizar scrapper-eltarro con OpenSpec"`
- AND `approvedStrategy.scope` MUST equal `"modernizar scrapper-eltarro con OpenSpec"`
- AND `approvedStrategy.status` MUST remain `"ACTIVE"`
- AND `approvedStrategy.allowedActions` MUST remain unchanged

#### Scenario: missing task reports error
- GIVEN no active task or no persisted state
- WHEN `/wam strategy set foo` runs
- THEN the command MUST return `"Sin tarea activa"`

#### Scenario: contract not approved reports error
- GIVEN `contract.status !== "APPROVED"`
- WHEN `/wam strategy set foo` runs
- THEN the command MUST return `"Contrato no aprobado (status=...)"`
