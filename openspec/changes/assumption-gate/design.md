# Assumption Gate — Design

## Goal

Gobernar las asunciones que el agente usaría silenciosamente: persistirlas,
escalarlas cuando tocan impacto material, resolverlas por evidencia del repo,
y bloquear aprobación/completion/DONE si una asunción crítica queda sin
resolver. Ejemplo: "Add support for deleting accounts" → el agente NO decide
silenciosamente hard/soft/anonymize.

## Modelo de datos

`contract.assumptions`: `[{ id: A1.., statement, classification, status }]`

- `classification`: `NON_BLOCKING` | `DECISION_CRITICAL` | `RESOLVED`
- `status`: `active` | `blocking` | `resolved`

`contract.unknowns` (machinery de changes 1-2, reusada): las asunciones
escaladas se **mirrorizan** acá (`unknown.assumptionId = A1`) para reutilizar
la fase `ASKING` + `/wam answer` sin duplicar el flujo.

## Flujo

1. `analyze()` → `auditAssumptions(prompt, projectInfo)` → strings →
   `buildAssumptions()` → objetos con `classification` por
   `classifyAssumption(statement)`.
2. `projectState` (index.js) copia `analysis.assumptions` → `contract.assumptions`.
3. `chat.message` (después de `buildPersistedState`, antes del check ASKING):
   `escalateAssumptions(state)` — asunciones activas `NON_BLOCKING` que matchean
   patrones de impacto → `DECISION_CRITICAL`/`blocking` + mirror a `unknowns`
   (blocking, `assumptionId`) → la fase `ASKING` existente bloquea la ejecución
   (R3: "blocked execution + task enters ASKING").
4. `/wam resolve <id> <evidencia>`: evidencia del repo convierte la asunción a
   hecho conocido (`RESOLVED`/`resolved`) — sin preguntar al usuario (R4).
5. `/wam answer <id> <respuesta>` (existente): además resuelve el
   `assumptionId` asociado al unknown.
6. `approveContract` + `evaluateCompletionGate`: bloquean si existe una asunción
   `DECISION_CRITICAL` con `status !== resolved` (además de los unknowns
   blocking) (R5).
7. `/wam assumptions`: lista `{id, classification, status, statement}`.

## Clasificación (`classifyAssumption`, rule-based)

`DECISION_CRITICAL` si el statement matchea:
`elim|delete|borr|actualiz|update|schema|migraci|endpoint|api|arquitectur|estructura|m[oó]dulo|seguridad|auth|token|compatib|breaking|alcance|scope|destructiv|data.?loss|aceptaci[oó]n|criterios`
— si no, `NON_BLOCKING` (puede proceder pero queda explícita en estado).

## Tests

`assumption-gate.test.mjs`:
- R1: asunción persistida con `{id, statement, classification, status}`.
- R2+R3: asunción activa NON_BLOCKING que toca impacto → reclassified
  DECISION_CRITICAL, mirror a unknowns, fase ASKING, ejecución bloqueada.
- R4: `/wam resolve` con evidencia → RESOLVED sin interacción de usuario.
- R5: con asunción crítica sin resolver → approve rechazado y claim de DONE
  bloqueado; tras resolver → approve + DONE permitidos.
