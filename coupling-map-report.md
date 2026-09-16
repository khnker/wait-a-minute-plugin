# Mapa de Acoplamiento entre Módulos Principales

> **Objetivo:** Detectar acoplamiento indebido entre módulos clasificándolos por responsabilidad (Decisión / Mutación / Parsing-Formatting) e identificando mezclas.
> **Fecha:** 2026-09-15
> **Alcance:** `index.js`, `engine.js`, `execution-engine.js`, `cognition-store.js`, `verification-lifecycle.js`, `context-manager.js` y módulos adyacentes.
> **No se refactoriza — solo diagnóstico.**

---

## 1. Clasificación de Responsabilidades por Módulo

### Leyenda
- 🔵 **DEC** = Decisiones (lógica que determina qué hacer, clasificar, evaluar, verificar)
- 🔴 **MUT** = Mutación de Estado (escritura a filesystem, base de datos, o modificación inmutable de estructuras)
- 🟡 **FMT** = Parsing/Formatting (transformación textual, serialización, extracción de campos, compresión)

---

### `engine.js` (530+ líneas exportadas)

| Función | Responsabilidad | Tipo |
|---------|----------------|------|
| `cavemanify()` | Compresión de texto (quita artículos, relleno) | 🟡 FMT |
| `estimateTokens()` | Cálculo/parseo de métricas de texto | 🟡 FMT |
| `findDuplicateTask()` | Parsing de summary + búsqueda comparativa | 🟡 FMT |
| `archiveTaskSession()` | Mutación: reescribe archivos de sesión | 🔴 MUT |
| `logArchitecturalDecision()` | DEC: registra decisiones arquitectónicas | 🔵 DEC + 🔴 MUT |
| `persistTaskState()` | Mutación: escribe taskState a filesystem | 🔴 MUT |
| `getTaskState()` | Lectura de estado (debería ser puro, lee filesystem) | 🔵 DEC + 🔴 MUT |
| `evaluatePersistentPolicies()` | DEC: evalúa políticas persistentes contra prompt | 🔵 DEC |
| `buildRegistry()` / `routeSkillsV2()` / `loadSkillOnDemand()` | DEC: selección y routing de skills | 🔵 DEC |
| `synthesizeContract()` | DEC: síntesis de contrato a partir de prompt | 🔵 DEC |
| `classifyAssumption()` / `buildAssumptions()` / `escalateAssumptions()` | DEC: clasificación de supuestos | 🔵 DEC |
| `formatBacklog()` | FMT: formatea backlog como texto | 🟡 FMT |
| `topicScope()` | DEC: determina alcance del topic | 🔵 DEC |
| `addToBacklog()` | MUT + DEC: agrega y decide | 🔵 DEC + 🔴 MUT |
| `analyze()` | DEC principal: clasifica prompt completo | 🔵 DEC |

**Acoplamiento del módulo:** 🔵🔴🟡 **MEZCLA GRAVE** — Decisiones estratégicas (contratos, políticas, skill selection) están en el mismo módulo que mutación de filesystem (`persistTaskState`, `archiveTaskSession`) y parsing/formato de texto (`cavemanify`, `estimateTokens`, `formatBacklog`).

---

### `index.js` (~1994 líneas — orquestador principal)

| Función | Responsabilidad | Tipo |
|---------|----------------|------|
| `analyze` (importado de engine.js) | DEC | 🔵 DEC |
| `startExperiment`, `noteSuccess`, `noteFailure` (importados de execution-engine) | DEC | 🔵 DEC |
| `applyCompletionGate()` | DEC: decide si tarea puede completarse | 🔵 DEC + 🔴 MUT |
| `projectState()` | DEC: construye estado del proyecto | 🔵 DEC + 🟡 FMT |
| `classifyActionAgainstStrategy()` | DEC: clasifica acción vs estrategia | 🔵 DEC |
| `classifyFailure()` | DEC: clasifica fallo de experimento | 🔵 DEC |
| `nextActionFrom()` | DEC: determina siguiente acción | 🔵 DEC |
| `truncate()` | FMT: trunca texto | 🟡 FMT |
| `emitTextPart()` | FMT: formatea partes de salida | 🟡 FMT |
| `prepareSystemInject()` | FMT + DEC: construye inyección de sistema (analiza + formatea) | 🔵 DEC + 🟡 FMT |
| `persistTaskState()` (importado de engine.js) | MUT: muta estado de tarea | 🔴 MUT |
| `updateContext()`, `updateTaskMemory()`, `updateLiveContext()` | MUT: muta memoria operacional | 🔴 MUT |
| `updateProjectMemo()` | MUT: escribe memo de proyecto | 🔴 MUT |
| `recordDecision()`, `compactDecisions()` | MUT: escribe decisiones | 🔴 MUT |
| `createSnapshot()`, `checkContinuation()`, `rebuildScope()` | MUT + DEC: snapshot + decisión de continuidad | 🔵 DEC + 🔴 MUT |
| `assembleContext()` (importado de assembly.js) | FMT + DEC: arma contexto | 🟡 FMT + 🔵 DEC |
| `writeCavemanSummary()` | FMT + MUT: escribe resumen comprimido | 🟡 FMT + 🔴 MUT |
| `getOperationalContext()` / `summarizeOperationalContext()` | DEC + FMT: lee y resume | 🔵 DEC + 🟡 FMT |
| `wamCli()` | DEC + MUT + FMT: CLI que hace de todo | 🔵 DEC + 🔴 MUT + 🟡 FMT |

**Acoplamiento del módulo:** 🔵🔴🟡 **MEZCLA EXTREMA** — Es el módulo más acoplado del proyecto. Funciones de decisión, mutación de estado y formateo de texto están completamente entrelazadas en 1994 líneas. No hay separación entre análisis (DEC) y persistencia (MUT).

---

### `execution-engine.js` (~170 líneas)

| Función | Responsabilidad | Tipo |
|---------|----------------|------|
| `startExperiment()` | DEC: decide iniciar/archivar experimento | 🔵 DEC + 🔴 MUT (llama a cognition-store) |
| `noteSuccess()` | DEC + MUT: decide éxito y muta línea evidencia | 🔵 DEC + 🔴 MUT |
| `noteFailure()` | DEC + MUT: decide fallo y muta estado | 🔵 DEC + 🔴 MUT |
| `handleContradiction()` | DEC: decide manejo de contradicción | 🔵 DEC |
| `createAssessment()` / `assessObservation()` | DEC: evalúa observación | 🔵 DEC |
| `deriveHypothesisStatus()` | DEC: deriva estado de hipótesis | 🔵 DEC (puro) |

**Dependencias externas:** `cognition-store.js` (CRUD cognitivo), `runtime-guards.js` (políticas), `cognitive-state.js` (rechazo hipótesis), `assessment-engine.js` (evaluación), `hypothesis-manager.js` (notas), `evidence-lineage.js` (evidencia).

**Acoplamiento del módulo:** 🔵 + 🔴 **MEZCLA MODERADA** — Decide resultados (DEC) pero directamente dispara mutaciones en cognition-store sin capa intermedia. La buena noticia es que NO hace parsing/formating de texto (🟡 limpio). La mala: cada decisión de ciclo de vida viene con su mutación directa, sin separación.

---

### `cognition-store.js` (~200 líneas)

| Función | Responsabilidad | Tipo |
|---------|----------------|------|
| `createHypothesis/Experiment/Observation` | MUT: append a JSONL | 🔴 MUT |
| `updateHypothesisStatus/completeExperiment/failExperiment` | MUT: reescribe archivo | 🔴 MUT |
| `archiveHypothesis` | MUT: cambia status (soft-archive) | 🔴 MUT |
| `listExperiments/Hypotheses/Observations` | Lectura de archivos | 🔴 MUT (read side-effect) |
| `hasRepetitiveFailure` | DEC: evalúa patrones de fallo | 🔵 DEC + 🔴 MUT |
| `migrateLegacyCognition()` | FMT + MUT: parsea formato legado y lo reescribe | 🟡 FMT + 🔴 MUT |

**Acoplamiento del módulo:** 🔴 **LIMPIO con excepción** — ~90% es pura mutación de estado (source of truth para cognición). `hasRepetitiveFailure()` introduce una decisión (DEC) dentro del store de datos — leve mezcla. `migrateLegacyCognition()` mezcla parsing de formato legado con escritura — mezcla aceptable para migración.

---

### `verification-lifecycle.js` (~65 líneas)

| Función | Responsabilidad | Tipo |
|---------|----------------|------|
| `isValidVerificationState()` | DEC: valida estados | 🔵 DEC (puro) |
| `transitionVerification()` | DEC: decide transición válida | 🔵 DEC (puro) |
| `createEvidence()` | DEC: valida y crea evidencia (inmutable) | 🔵 DEC (puro, retorna objeto) |
| `isVerified()` | DEC: evalúa requisito | 🔵 DEC (puro) |
| `canComplete()` | DEC: decide completabilidad | 🔵 DEC (puro) |
| `hasOutstandingWork()` | DEC: evalúa trabajo pendiente | 🔵 DEC (puro) |
| `verifyRequirement()` | DEC + FMT: decide verificación + estructura resultado | 🔵 DEC (puro, retorna objeto) |
| `failRequirement()` | DEC: decide fallo | 🔵 DEC (puro) |

**Acoplamiento del módulo:** ✅ **CLEAN** — Puro DEC. No muta estado (retorna nuevos objetos, no escribe). No hace parsing/formating. Es el módulo más limpio del análisis.

---

### `context-manager.js` (~340 líneas)

| Función | Responsabilidad | Tipo |
|---------|----------------|------|
| `register()` / `registerSource()` | MUT: agrega fuente al registry | 🔴 MUT |
| `getSource()` / `listSources()` | Lectura | 🔴 MUT (read side-effect on registry) |
| `transition()` (delegado a context-lifecycle) | DEC + MUT: decide + aplica transición | 🔵 DEC + 🔴 MUT |
| `assignMemoryLayer()` | DEC + MUT: decide capa + asigna | 🔵 DEC + 🔴 MUT |
| `selectEvictions()` / `archiveCandidates()` | DEC: decide qué evacuar | 🔵 DEC |
| `promoteItem()` / `demoteItem()` (delegado) | MUT: modifica posición | 🔴 MUT |
| `clear()` | MUT: limpia registry | 🔴 MUT |

**Dependencias externas:** `context-source-registry.js`, `context-lifecycle.js`, `context-memory-layers.js`, `context-promotion.js`, `context-demotion.js`.

**Acoplamiento del módulo:** 🔵 + 🔴 **MEZCLA MODERADA-ACEPTABLE** — Decisión y mutación están entrelazadas porque es un ORQUESTADOR DE ESTADO (patrón esperado). Las decisiones (qué capa, qué evacuar) inmediatamente aplican cambios. Es un patrón de "command" cohesivo, no un acoplamiento indebido per se. No tiene parsing/formating (🟡 limpio).

---

## 2. Mapa de Acoplamiento Cruzado (Matriz)

```
                    engine.js  execution-engine  cognition-store  verification-lifecycle  context-manager  index.js
engine.js              —          consumes         consumed-by        consumed-by            consumed-by      consumed-by
execution-engine       consumes   —                consumed-by        consumed-by            consumed-by      consumes
cognition-store        consumed-by consumed-by      —                  consumed-by            not-used         consumed-by
verification-lifecycle consumed-by consumed-by      consumed-by        —                      not-used         consumed-by
context-manager        not-used   not-used         not-used           not-used               —                not-used*
index.js               consumed-by consumed-by      consumed-by        consumed-by            not-used         —

* context-manager no es usado por index.js actualmente (aislado)
```

**Leyenda:** `consumes` = importa y usa funciones | `consumed-by` = es importado por | `—` = sin relación directa

---

## 3. Módulos con Acoplamiento Indebido (Mezcla de Responsabilidades)

### 🔴 CRÍTICO

| Módulo | Mezcla | Detalle |
|--------|--------|---------|
| **`index.js`** | DEC + MUT + FMT | 1994 líneas que mezclan decisiones estratégicas, persistencia de estado y formateo de texto. `applyCompletionGate()` decide Y muta estado. `prepareSystemInject()` analiza Y formatea. `writeCavemanSummary()` comprime Y escribe. |
| **`engine.js`** | DEC + MUT + FMT | Funciones de decisión estratégica (`analyze`, `synthesizeContract`, `evaluatePersistentPolicies`) conviven con mutación (`persistTaskState`, `archiveTaskSession`) y parsing (`cavemanify`, `estimateTokens`, `formatBacklog`). |

### 🟡 MODERADO

| Módulo | Mezcla | Detalle |
|--------|--------|---------|
| **`execution-engine.js`** | DEC + MUT | Decisiones de ciclo de vida (`startExperiment`, `noteSuccess`, `noteFailure`) disparan directamente mutaciones en cognition-store sin capa intermedia. |
| **`context-manager.js`** | DEC + MUT | Aceptable como patrón orchestrator, pero decisiones (`assignMemoryLayer`) y mutaciones (`register`) están en el mismo objeto. |

### 🟢 MÍNIMO / LIMPIO

| Módulo | Estado | Detalle |
|--------|--------|---------|
| **`cognition-store.js`** | LIMPIO (90%) | Pura mutación de estado. Excepción menor: `hasRepetitiveFailure()` mezcla DEC en MUT. |
| **`verification-lifecycle.js`** | LIMPIO ✅ | 100% DEC puro. Sin side effects. Sin formatting. |

---

## 4. Patrones de Acoplamiento Detectados

### A → B muta estado
- `index.js → engine.js`: index.js pasa `persistTaskState` como callback (A delega MUT a B) ✅ Patrón correcto
- `index.js → memory.js`: index.js llama `updateContext`, `updateProjectMemo`, `updateLiveContext` directamente ❌ Acoplamiento directo a mutación
- `execution-engine.js → cognition-store.js`: execution-engine decide Y escribe en store ❌ DEC y MUT mezclados a través de frontera

### A → B parsea
- `engine.js → string`: `cavemanify()`, `estimateTokens()`, `findDuplicateTask()` — parsing interno de texto dentro del módulo DEC
- `index.js → prompt`: `prepareSystemInject()` parsea prompt para construir inyección — dentro de módulo DEC+FMT

### A → B formatea
- `index.js → contexto`: `assembleContext()` retorna `pack.lines` (FMT) usado en inyección DEC
- `engine.js → backlog`: `formatBacklog()` formatea para decisión de backlog

---

## 5. Resumen Ejecutivo

```
┌─────────────────────┬────────────┬────────────┬────────────┬─────────────────────────────┐
│ Módulo              │   DEC      │   MUT      │   FMT      │ Veredicto                   │
├─────────────────────┼────────────┼────────────┼────────────┼─────────────────────────────┤
│ engine.js           │    ✅ Alta │    ❌ Alta │    ❌ Alta │ REFACTOR: Separar persist,  │
│                     │            │            │            │ parse y decisiones          │
├─────────────────────┼────────────┼────────────┼────────────┼─────────────────────────────┤
│ index.js            │    ✅ Alta │    ❌ Alta │    ❌ Alta │ REFACTOR: Shell debería    │
│                     │            │            │            │ delegar DEC y MUT a capas   │
├─────────────────────┼────────────┼────────────┼────────────┼─────────────────────────────┤
│ execution-engine.js │    ✅ Alta │    ❌ Mod  │    ✅ None │ ACEPTABLE: dispara MUT      │
│                     │            │            │            │ pero no lo hace directo     │
├─────────────────────┼────────────┼────────────┼────────────┼─────────────────────────────┤
│ cognition-store.js  │    ⚠️ Mod  │    ✅ Alta │    ✅ None │ LIMPIO: store puro con      │
│                     │            │            │            │ excepciones menores         │
├─────────────────────┼────────────┼────────────┼────────────┼─────────────────────────────┤
│ verification-lifecyk│    ✅ Alta │    ✅ None │    ✅ None │ LIMPIO: DEC puro (modelo    │
│                     │            │            │            │ ideal alcanzado)            │
├─────────────────────┼────────────┼────────────┼────────────┼─────────────────────────────┤
│ context-manager.js  │    ✅ Mod  │    ❌ Mod  │    ✅ None │ ACEPTABLE: patrón          │
│                     │            │            │            │ orchestrator coherente      │
└─────────────────────┴────────────┴────────────┴────────────┴─────────────────────────────┘
```

### 3 Principales Hallazgos

1. **`index.js` y `engine.js` son "God Modules"** — Mezclan las 3 responsabilidades (DEC+MUT+FMT). Son los candidatos principales a desacoplamiento.

2. **`verification-lifecycle.js` es el modelo a seguir** — Es puramente decisional, sin side effects, sin formatting. Otros módulos deberían aspirar a este nivel de limpieza.

3. **El acoplamiento DEC→MUT más peligroso** está en `index.js → memory.js` y `execution-engine.js → cognition-store.js`, donde decisiones de negocio disparan escrituras directas sin intermediación.

---

## 6. Grafos de Dependencia (Texto)

```
DEPENDENCIAS DE IMPORT DIRECTO:

index.js ──imports──→ engine.js (DEC, MUT, FMT)
index.js ──imports──→ execution-engine.js (DEC+MUT)
index.js ──imports──→ cognition-store.js (MUT)
index.js ──imports──→ memory.js (MUT)
index.js ──imports──→ context.js (DEC+MUT)
index.js ──imports──→ assembly.js (DEC+FMT)
index.js ──imports──→ verification.js (DEC)
index.js ──imports──→ context-snapshot.js (DEC+MUT)

execution-engine.js ──imports──→ cognition-store.js (MUT)
execution-engine.js ──imports──→ assessment-engine.js (DEC)
execution-engine.js ──imports──→ cognitive-state.js (DEC+MUT)
execution-engine.js ──imports──→ hypothesis-manager.js (DEC+MUT)
execution-engine.js ──imports──→ runtime-guards.js (DEC)
execution-engine.js ──imports──→ evidence-lineage.js (MUT+DEC)

context-manager.js ──imports──→ context-source-registry.js (MUT)
context-manager.js ──imports──→ context-lifecycle.js (DEC+MUT)
context-manager.js ──imports──→ context-memory-layers.js (DEC+MUT)
context-manager.js ──imports──→ context-promotion.js (MUT)
context-manager.js ──imports──→ context-demotion.js (MUT)

engine.js ──imports──→ logger.js (FMT)
engine.js ──imports──→ context-decision-audit.js (DEC)

cognition-store.js ──imports──→ fs, path (SOLO I/O estándar) ✅

verification-lifecycle.js ──imports──→ (NINGUNO) ✅
```

---

*Reporte generado como diagnóstico. No se realizan modificaciones al código.*
