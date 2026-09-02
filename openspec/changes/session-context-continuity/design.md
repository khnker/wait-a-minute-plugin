# Session Context Continuity — Design

## Flujo

```
ensureSession() → session_id (crear o preservar en resume)
inicialización (primer chat.message / factory):
  LOAD L1 FOUNDATION → SELECT package (budget) → INJECT via prepareSystemInject
DONE (gate.allDone):
  WRITE session log (progreso + candidatos)
  evaluar candidatos a persistencia (no auto-promover)
```

## Session

- `.wam/session.json`: { session_id, created_at, resumed_from }
- session_id nuevo por sesión; preservado en resume explícito
- cápsulas L3 referencian su session_id de origen

## Promoción (CLI /wam ctx)

- `/wam ctx promote <id> <L2|L1>` — L1 exige `approved` (provenance check:
  inferred + L1 sin aprobación → rechazado)
- `/wam ctx list|get|show` — inspección y recuperación bajo demanda

## Cross-session

El selector siempre considera L1/L2; L3 entra solo si matchea la tarea
(con su session_id de origen en metadata).
