# Proposal: verification-lifecycle

## Why
"Creo que funciona" no es verificación. Los requisitos se marcan como "done" sin evidencia machine-verifiable. No hay vínculo formal entre requirement → verification method → result → evidence. COMPLETED puede ocurrir sin que ningún requisito tenga evidencia suficiente.

## What Changes
- New `verification-lifecycle.js` with states: UNVERIFIED → VERIFYING → VERIFIED (or → FAILED → new hypothesis).
- Requirement verification tracking: requirement → verification method → result → evidence.
- COMPLETED only allowed when all requirements have `status: "verified"` and at least one evidence item each.
- `/wam progress <id> verified <evidence>` links evidence to requirement.

## Scope
- `verification-lifecycle.js` (new)
- `verification.js` (existing — add verification state tracking)
- `index.js` (gate completion on evidence)

## Non-Goals
- Automated test execution framework
- Continuous verification pipelines
- Cross-task evidence aggregation
