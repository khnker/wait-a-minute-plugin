# WAM v1 — Matriz de Aceptación

Estado: **PARCIAL → en validación** · Fecha: 2026-08-31
Leyenda: ✅ demostrado por test/evidencia · 🟡 parcial (policy/API sin enforcement o gap menor) · ❌ no implementado

Evidencia ejecutable: `npm test` → **43 tests** (wait-a-minute-test + plugin-load + operational-memory + readme-validation + completion-gate-e2e).

---

## §0 Principio central

| Punto | Estado | Evidencia |
|---|---|---|
| Control layer del agente (no solo recomendaciones) | ✅ | gate reescribe el claim DONE entrante (plugin-load "Hard Block") |
| No declarar DONE sin contrato de finalización | ✅ | `evaluateCompletionGate` bloquea si faltan reqs (e2e G5-a) |
| Detecta cuándo la tarea está realmente terminada | ✅ | `allDone` = todos los reqs done + evidencia + contrato APPROVED (e2e G5-c) |
| Impide finalización prematura | ✅ | BLOCK + reescritura del claim (e2e G5-a/G5-b/G5-d) |
| Continuidad cuando el agente pierde el hilo | ✅ | `/wam task switch` + state persistido + nextAction (plugin-load "Task Resume") |
| Minimiza intervención (rigor adaptativo) | 🟡 | trivial→FAST/low; sin embargo todo prompt no-trivial genera contrato; no hay modo "silencioso" |

## §1 Pre-flight / Investigate

| Punto | Estado | Evidencia |
|---|---|---|
| Inspecciona repo, estructura, stack, config | ✅ | `inspectProject` (engine.js:836): package.json, deps, framework, AGENTS.md, openspec, skills |
| Detecta AGENTS.md / config OpenCode | ✅ | `known` incluye AGENTS.md; config OpenCode vía `config` input del hook |
| Identifica convenciones / archivos afectados | 🟡 | deps+framework detectados; no deriva lista específica de archivos afectados por la tarea |
| Distingue observado de inferido / incertidumbres | ✅ | `known` vs `inferred` vs `assumed`/`unknown` (análisis) |
| No inicia implementación por prompt "claro" | ✅ | hook inyecta análisis ANTES de ejecución; WAM no implementa por sí mismo |
| Responde ¿qué existe / qué cambiar / qué afecta / qué no sabemos? | 🟡 | "qué existe" y "qué no sabemos" sí; "qué partes serán afectadas" no explícito |

## §2 Task Classification

| Punto | Estado | Evidencia |
|---|---|---|
| Tipo / complejidad / riesgo / rigor | ✅ | `intent.classification`, `risk`, `complexity`, rigor NORMAL/STRICT/FAST |
| Alcance esperado / tecnologías afectadas | 🟡 | framework detectado; alcance no cuantificado (no DIRECT/SMALL/MEDIUM/LARGE) |
| Necesidad de investigación / skills / OpenSpec | ✅ | `unknown`/`assumed` alimentan rigor; routing selecciona skills; architectural→STRICT |

## §3 Scope

| Punto | Estado | Evidencia |
|---|---|---|
| Policy persistente scope (scope-creep, surface-change) | ✅ | `persistentPolicies` scope ACTIVE + gates (readme-validation "Persistent Policies") |
| Detecta cambios fuera de scope / refactors innecesarios | 🟡 | gates declarados e inyectados al prompt; sin detector programático del diff |

## §4 Simplify / Ponytail

| Punto | Estado | Evidencia |
|---|---|---|
| Policy persistente (no skill on-demand) | ✅ | simplify ACTIVE por defecto + restricciones YAGNI/reuso/stdlib (readme-validation) |
| Detecta solución significativamente más simple | ❌ | no existe detector; simplify opera como restricción de prompt |

## §5 Verify (persistente)

| Punto | Estado | Evidencia |
|---|---|---|
| Exige evidencia; no acepta "parece funcionar" | ✅ | `markRequirement` rechaza `done` sin evidencia (e2e G5-b) |
| Req sin evidencia no puede marcarse verificado | ✅ | gate trata `done`-sin-evidencia como pendiente "(sin evidencia)" (e2e G5-b, §32) |
| Evidencia registrada y asociada al requirement | ✅ | `requirements[].evidence[]` + CLI `/wam progress` (readme-validation "Real Progress") |
| Ejecuta tests/lint/typecheck | 🟡 | WAM exige evidencia textual; la ejecución de checks la hace el agente (WAM no ejecuta) |
| Verifica consumidores/migraciones | 🟡 | vía requisito+evidencia manual; no automatizado |

## §6 Completion Contract

| Punto | Estado | Evidencia |
|---|---|---|
| Genera contrato (objetivo, reqs, verif, rigor, incertidumbres) | ✅/🟡 | requirements + verification + constraints + rigor; asumidos/desconocidos en popup (readme-validation "Completion Contract") |
| Usuario aprueba / edita / rechaza | ✅ | `/wam contract approve|edit|reject` (readme-validation "Workflow") |
| Versión aprobada persistida y estable | ✅ | `buildPersistedState` merge preserva contrato APPROVED (e2e G5-c) |
| Lifecycle PROPOSED→APPROVED→IMPLEMENTING→VERIFYING→COMPLETED | 🟡 | fases reales: PROPOSED, IMPLEMENTING, DONE, WAITING; **VERIFYING y COMPLETED como fase no existen** (summary.md usa COMPLETED) |

## §7 Progress Gate

| Punto | Estado | Evidencia |
|---|---|---|
| Estados PENDING/IN_PROGRESS/IMPLEMENTED/VERIFIED/BLOCKED | ❌ | solo `pending` \| `done` |
| ID estable, estado, evidencia, lastAction, nextAction | ✅ | `req.id`, `status`, `evidence[]`, `state.lastAction`, `nextActionFrom` |
| Calcula progreso / pendientes / reconstruye tras reinicio | ✅ | badge pend/total + resume (plugin-load) |
| "implementado" ≠ "verificado" | 🟡 | done exige evidencia pero no hay estado VERIFIED separado |
| Registrar bloqueos | ❌ | sin estado BLOCKED |

## §8 Completion Gate real

| Punto | Estado | Evidencia |
|---|---|---|
| Detecta intento de finalización | ✅ | regex claims done/listo/terminé/declare done |
| Comprueba requirements + evidencia | ✅ | e2e G5-a (reqs) + G5-b (evidencia) |
| Verifica contrato aprobado | ✅ | e2e G5-d (nuevo, §27) |
| Comprueba verification (resultados) | 🟡 | exige evidencia textual; no valida resultados de checks reales |
| Bloquea prematuro + indica qué falta + permite continuar | ✅ | listado + "(sin evidencia)" + `Continuar con:` nextAction |
| COMPLETED no arbitrario | ✅ | solo `gate.allDone` → phase DONE (index.js) |
| Distingue BLOCK/VERIFY/CONTINUE/DONE | 🟡 | BLOCK y DONE reales; VERIFY no diferenciado de BLOCK |

## §9 Continuidad / Resume

| Punto | Estado | Evidencia |
|---|---|---|
| Persiste task-id / contract / requirements / progress / evidence / lastAction / nextAction | ✅ | `state.yaml` completo + `lastAction` + `nextAction` |
| Recupera tarea, dónde quedó, qué falta, instrucción concreta | ✅ | `/wam task switch` + re-inyección de fase/pendientes (plugin-load "Task Resume") |
| No reinicia la tarea arbitrariamente | ✅ | merge de estado existente en `buildPersistedState` |

## §10 Operational Memory

| Punto | Estado | Evidencia |
|---|---|---|
| Init automático, idempotente, sin ficticio | ✅ | operational-memory "Initialization" x2 |
| context: project / architecture / recent-changes / decisions / constraints | ✅ | 5 docs con APIs; project auto-generado desde projectInfo (index.js) |
| Project: stack/estructura/tooling/convenciones | ✅ | `updateProjectMemo` (observed/inferred) |
| decisions: motivo/estado/fecha/provenance | ✅ | `recordDecision` + tests preservación |
| architecture mantenida incrementalmente | 🟡 | API `updateContext` existe; sin auto-update en el lifecycle (solo project + recent-changes) |

## §11 Provenance de memoria

| Punto | Estado | Evidencia |
|---|---|---|
| observed / inferred / user-decided distinguidos | ✅ | operational-memory "Provenance" |
| Jerarquía: inferencia no sobrescribe user-decided | ✅ | "Decisiones" + "Constraints" (preserved) |
| stale + last_verified | ✅ | "Staleness" |
| Revalidación contra el repo | 🟡 | no automatizada |

## §12 Memoria incremental

| Punto | Estado | Evidencia |
|---|---|---|
| Actualiza solo doc afectado, sin duplicar, sin trivial | ✅ | operational-memory "Updates" (both) + addRecentChange dedup |
| No reconstruye `.wam/` completo | ✅ | read-modify-write por doc |

## §13 Task Memory

| Punto | Estado | Evidencia |
|---|---|---|
| Espacio aislado `.wam/tasks/<id>/` | ✅ | isolation test |
| contract.yaml / progress.yaml / evidence.md / summary.md | 🟡 | implementado como `state.yaml` (contract+progress, JSON) + `evidence.md`/`summary.md`; devianza documentada en memory.js:7 |
| summary.md con objetivo/cambios/verificación/estado | ✅ | "Memory on DONE" + e2e G5-c |
| summary.md con decisiones/pendientes/próxima acción | 🟡 | no incluidos |

## §14 Separación memoria / estado / cache

| Punto | Estado | Evidencia |
|---|---|---|
| context/ tasks/ skills/ cache/ separados | ✅ | dirs + `.gitignore` (memory.js WAM_GITIGNORE) |
| cache ≠ fuente de verdad; task no contamina context; context no reemplaza inspección | ✅ | diseño + documentación (memory.js); context es "contexto inicial acelerador" (index.js:84) |

## §15 Skills Registry

| Punto | Estado | Evidencia |
|---|---|---|
| Registry embebido, sin red, ids/desc/keywords/capabilities/provenance/status | ✅ | readme-validation "Skill Registry autocontenido" |
| Scoring + routing | ✅ | "Single Router" |
| Deduplication | 🟡 | build-time (scripts/build-registry.cjs); sin test |
| domain | 🟡 | no hay campo domain en registry |
| Valida skills antes de incorporar | 🟡 | build-time claim; sin test |

## §16 Skills autocontenidas

| Punto | Estado | Evidencia |
|---|---|---|
| Contenido embebido en el plugin; offline; path local | ✅ | readme-validation "Content On Demand" (SKILL.md real a disco, write-on-first-use) |
| `skill-id → contenido` | ✅ | `registry[id].content` + loadSkillOnDemand |
| Hash / integridad reproducible del contenido | ❌ | no existe hash |

## §17 Skill Router

| Punto | Estado | Evidencia |
|---|---|---|
| Un único router (legacy deprecado) | ✅ | `routeSkillsV2`; wait-a-minute-test assert "un solo router" |
| Scoring ponderado, keywords/capabilities/nombre/desc, ranking, límite, rigor, rechazo no-aprobadas, explain | ✅ | "Single Router" (sorted desc, límite, explain) |
| Matching por domain | 🟡 | sin campo domain |
| No cargar 20 skills "por si acaso" | ✅ | límite 0/3/5 por rigor (MINIMAL/STANDARD/RIGOROUS) |

## §18 Skill Loading

| Punto | Estado | Evidencia |
|---|---|---|
| loadSkillOnDemand no es stub; contenido real cargable | ✅ | "Content On Demand" + "Content Materialization" |
| No se carga si no seleccionada / solo cuando corresponde | 🟡 | inyección del path en hook tras `cfg.experimental.waitAMinuteInject`; off por defecto |
| Uso registrado | ❌ | sin audit (§20) |

## §19 Skill Lifecycle

| Punto | Estado | Evidencia |
|---|---|---|
| DISCOVERED/APPROVED/REJECTED como metadata | ✅ | registry status; routing rechaza no-APPROVED |
| LOADED / USED como estados reales | ❌ | no trackeados |

## §20 Skill Audit

| Punto | Estado | Evidencia |
|---|---|---|
| Registra uso/timestamp/skill/task/historial acotado | ❌ | no implementado |

## §21 CLI

| Punto | Estado | Evidencia |
|---|---|---|
| skills list / search / inspect / explain | ✅ | readme-validation "CLI" |
| progress (list + done+candencia + pending) | ✅ | tras fix de args (readme-validation) |
| task list / switch | ✅ | plugin-load "Task Resume" |
| status | ❌ | solo `task list`; no hay `/wam status` |
| scan/update no expuestos como runtime | ✅ | build tooling en `scripts/` |

## §22 Build pipeline de skills

| Punto | Estado | Evidencia |
|---|---|---|
| fetch→validate→normalize→dedupe→select→bundle→registry→test→commit | 🟡 | `scripts/build-registry.cjs` existe; reproducibilidad/determinismo sin test |

## §23 Seguridad

| Punto | Estado | Evidencia |
|---|---|---|
| No persiste credenciales/tokens/secretos | ✅ | `redact()` + tests (operational-memory "Security") |
| No conversaciones completas | ✅ | solo conocimiento derivado; sin `.wam/conversation.log` |
| Skills externas validadas antes de incorporar | 🟡 | build-time; sin test |
| Prompt injection persistente desde memoria | 🟡 | policies hardcodeadas (PERSISTENT_POLICIES constantes); sin test específico |

## §24 OpenSpec

| Punto | Estado | Evidencia |
|---|---|---|
| Detecta cambios complejos / distingue directo vs arquitectónico | ✅ | architectural→STRICT (rigor) |
| Crea change proposal | ❌ | sin integración openspec runtime |
| No crea OpenSpec para trivial / no modifica sin necesidad | ✅ | análisis solo clasifica; no toca openspec |

## §25 Debug

| Punto | Estado | Evidencia |
|---|---|---|
| Pipeline symptom→diagnosis→hypothesis→experiment→verify | ❌ | pauta externa (skill/agent), no mecanismo WAM |

## §26 Review

| Punto | Estado | Evidencia |
|---|---|---|
| Segundo pase con scope/regresión/complejidad/tests | ❌ | no automatizado (posible integración futura con @arch-review) |

## §27 DONE = realmente DONE

| Condición | Estado |
|---|---|
| contract approved | ✅ (gate G5-d) |
| all requirements done | ✅ (gate G5-a) |
| evidence exists por requirement | ✅ (gate G5-b) |
| required checks passed | 🟡 (evidencia textual; WAM no ejecuta checks) |
| no unresolved blocker | ✅ (estado del gate) |
| scope respected | 🟡 (policy declarada, sin detector) |

## §28 Evidencia

| Punto | Estado | Evidencia |
|---|---|---|
| Evidencia persistida y asociada al requirement | ✅ | `requirements[].evidence[]` |
| Distinguible de afirmación textual | 🟡 | es texto aportado por `/wam progress ... done <evidencia>`; no parseada/validada |

## §29 Offline / Self-contained

| Punto | Estado | Evidencia |
|---|---|---|
| Runtime sin GitHub / sin repos externos / registry en plugin / skills en plugin / sin red | ✅ | registry embebido + loadSkillOnDemand local (tests) |

## §30 UX

| Punto | Estado | Evidencia |
|---|---|---|
| Rigor adapta a complejidad/riesgo | ✅ | MINIMAL/STANDARD/RIGOROUS (limit 0/3/5) |
| Mensajes concretos, explica por qué bloquea y qué falta | ✅ | gate listado + nextAction |
| No repite contexto / no inunda con skills | ✅ | cap 3-5; nota de memoria compacta |
| No interrumpe tareas triviales | 🟡 | trivial→FAST/ready pero contrato se presenta igual |

## §31 Idempotencia

| Punto | Estado | Evidencia |
|---|---|---|
| init múltiple, decisión repetida, resume, memory | ✅ | operational-memory tests (idempotente, dedup) |

## §32 Tests — cobertura

| Área | Estado |
|---|---|
| Pre-flight: repo vacío / grande / stack desconocido / AGENTS.md / sin tests | 🟡 parcial (cubierto repo con package.json; no casos vacío/grande/desconocido) |
| Policies (scope/verify/simplify) | ✅ ACTIVE default |
| Contract: propose/approve/edit/reject/persist/resume | ✅ |
| Progress: pending/completed/evidence/resume | ✅ (pending/done/evidence); ❌ verified/blocked |
| Gate: DONE pendientes→BLOCK · DONE sin evidencia→BLOCK · DONE verificado→ALLOW · **DONE tests fallando→BLOCK** | ✅ x3 en completion-gate-e2e; ❌ "tests fallando" (no ejecuta checks) |
| Skills: registry/search/scoring/routing/bundled/loading/approval | ✅; 🟡 dedup/audit sin test |
| Memory: init/incremental/provenance/conflict/stale/recovery/secret | ✅ |

## §33 Criterio final + G1–G5

| Gate | Definición | Estado |
|---|---|---|
| G1 Understand | investigate + clasificación + scope | ✅/🟡 (scope sin detector) |
| G2 Contract | contrato aprobado/editable | ✅ |
| G3 Execute | skills + progress + continuidad | ✅/🟡 (audit/loading-off) |
| G4 Verify | review + evidencia | 🟡 (review externo; evidencia textual) |
| **G5 Finish** | gate bloquea DONE incorrecto + prueba definitiva end-to-end | ✅ `completion-gate-e2e.test.mjs` (4 tests: pendiente→BLOCK, sin evidencia→BLOCK, sin approve→BLOCK, completo→ALLOW) |

### La prueba definitiva (checklist §33)

```text
"Implementa X y agrega tests" → contrato 2 reqs → approve
→ marcar X done (evidencia) → DONE claim  → ⛔ BLOCK (+listado + nextAction)     ✅ e2e G5-a
→ done sin evidencia                        → ⛔ BLOCK "(sin evidencia)"        ✅ e2e G5-b
→ todo done + evidencia, contrato PROPOSED → ⛔ BLOCK "aprobar contrato"        ✅ e2e G5-d
→ approve + todo verificado                → ✅ ALLOW, phase DONE, summary.md   ✅ e2e G5-c
```

---

## Verdicto

- **WAM v1 ES un mecanismo de control efectivo**: los 3 ejes críticos (gate bloquea, evidencia obligatoria, contrato aprobado) están implementados y demostrados end-to-end con el test definitivo G5.
- **Listo para v1** ✅ si se aceptan estas limitaciones documentadas.
- **Gaps reales pendientes** (para v1.1 o decisión explícita):
  1. Estados de progress `IN_PROGRESS/VERIFIED/BLOCKED` (hoy solo pending/done).
  2. `VERIFYING` + `COMPLETED` como fases del lifecycle de contrato.
  3. `/wam status`.
  4. Skill audit (uso/timestamp/task) y lifecycle LOADED/USED real.
  5. Detector programático de scope creep / superficie de cambio mínima.
  6. Integración OpenSpec runtime (crear change proposal).
  7. Hash/integridad del contenido embebido en el registry.
  8. Tests pre-flight para repo vacío / grande / stack desconocido.
  9. Review automático de segundo pase.