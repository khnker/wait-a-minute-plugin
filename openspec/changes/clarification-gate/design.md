# Clarification Gate — Design

## Goal

Cerrar el gap entre "detectar incertidumbre material" y "forzar la aclaración":
que un UNKNOWN/ASSUMED decision-critical sea imposible de convertir
silenciosamente en decisión de implementación, con el mismo nivel de
enforcement que ya tiene DONE.

## Estado

`ASKING` se suma a la máquina existente (extensión, no sustitución):

```
PROPOSED → ASKING → PROPOSED → APPROVED → IMPLEMENTING → VERIFYING → DONE
     └────── REJECTED      (ASKING → APPROVED/DONE/IMPLEMENTING: no permitido)
```

Transiciones: `PROPOSED → ASKING` (existe incertidumbre crítica sin resolver);
`ASKING → PROPOSED` (respuestas recibidas + re-análisis; si queda incertidumbre
nueva → `ASKING → ASKING`); `ASKING → APPROVED` directo prohibido.

## Modelo de datos

Las preguntas bloqueantes viven en `contract.unknowns` (reuso del machinery de
changes 1-2), con shape estable:

```
unknowns: [{ id: "U1", question, reason?, source, classification, status, options: [...] }]
```

- `status`: `pending|answered|resolved` (blocking = pending).
- `options`: cuando la decisión es enumerable (ej. `["hard delete","soft delete","anonymizar"]`).
- Las asunciones escaladas se mirrorizan aquí con `assumptionId` (change 3).

## Enforcement

1. **`tool.execute.before`**: si la tarea activa está en `ASKING`, las
   herramientas mutantes (`BLOCKED_TOOLS` = write/edit/bash/task/todowrite/pty_*)
   abortan con directiva `ENFORCED BLOCK`; las read-only (read/grep/glob/docs/graph)
   siguen permitidas (investigar antes de preguntar).
2. **`chat.message` en ASKING** — clasificación del mensaje:
   - `implementation` (verbos de implementación) → NO se consume como respuesta;
     el prompt se reescribe a la directiva bloqueante (AC5).
   - `new-intent` (olvida/no quiero/en realidad/cambio de idea) → nueva tarea
     (`task-<ts>`), la anterior queda persistida sin contaminar (E2E-06).
   - `answer` (resto) → `answerFromMessage`: resuelve TODAS las blocking
     pendientes con el texto, resuelve assumptions asociadas (`resolvedBy:
     "answer"`), fase → `PROPOSED`, emite `✓ question answered · assumption
     resolved · contract updated · ready → proceed`.
3. **Fast-Path**: condición añade `phase !== "ASKING"` (AC10 — el punto de
   regresión más probable).
4. **Completion Gate**: intacto; `ASKING` intercepta antes del gate (AC11),
   y los guards de `approveContract`/`evaluateCompletionGate` ya bloquean con
   unknowns/assumptions sin resolver (changes 1-3).

## Re-análisis tras respuesta

Responder NO da por lista la tarea: `answerFromMessage` deja el contrato en
`PROPOSED`; el siguiente ciclo de pre-flight re-evalúa intent/contexto/
asunciones/unknowns/riesgo/skills; cambios materiales del contrato exigen
nueva aprobación (nunca se conserva APPROVED silenciosamente).

## Observabilidad

Logs best-effort con prefijo `[wait-a-minute]`: activación del gate, unknown
trigger, pregunta generada, motivo decision-critical, recepción de respuesta,
re-análisis y resolución. Nunca se loggean secretos.

## Backward compatibility

Tareas sin `unknowns` siguen igual; estados previos válidos se conservan;
`ASKING` es aditivo; `state.yaml` antiguo carga sin migración destructiva
(`buildPersistedState` preserva contrato existente).
