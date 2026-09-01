# Clarification Gate — Tasks

## Implementación
- [x] Estado `ASKING` explícito (change 2 — blocking-questions)
- [x] `tool.execute.before`: bloqueo de herramientas mutantes en ASKING; read-only permitidas
- [x] `chat.message` en ASKING: clasificación implementation / new-intent / answer
- [x] Respuesta natural → `answerFromMessage` (resuelve unknowns + assumptions, → PROPOSED)
- [x] Intercepción de prompts de implementación (rewrite a directiva bloqueante)
- [x] Fast-Path: excepción `phase !== "ASKING"`
- [x] `options` en preguntas (migrate-or-delete / delete-scope)
- [x] Cambio de tarea → nueva tarea sin contaminación (E2E-06)
- [x] CLI `/wam` usable en ASKING (no gate trap)

## Verificación
- [x] Tests `clarification-gate.test.mjs` (AC5, respuesta natural, new-intent, options, wam cmds en ASKING)
- [x] Suite completa en verde
- [x] `openspec validate --changes` 4/4
- [x] Commit + push main
