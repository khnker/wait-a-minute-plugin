# Context Assembly Layer

## Proposal

### Context

WAM persiste 4 fuentes de contexto (global/policy, project, task, session)
pero el runtime no declara formalmente qué fuentes entran al prompt para una
tarea concreta. La evaluación externa sitúa el sistema en 3.5/4 niveles: falta
que el ensamblado sea estrictamente selectivo — "qué contexto necesita esta
tarea, de qué nivel, y cuánto de cada nivel".

### Why

El objetivo no es persistir más memoria sino **enviar el contexto correcto
para la tarea, ni más ni menos**. Controlar el tamaño (caveman, headroom)
no controla la relevancia semántica: hoy una tarea trivial puede cargar
documentos de proyecto no relacionados y una tarea arquitectónica puede
perder decisions/constraints.

### What Changes

Introduce `assembleContext()` — la Context Assembly Layer:

- Define formalmente 4 niveles con fuente canónica, obligación y prohibición:
  N0 Global/Policy (obligatorio, tiny), N1 Project (selectivo por dominio),
  N2 Task (obligatorio: live task state), N3 Session (capsules por utility).
- Reglas de carga por clasificación de la tarea: trivial → solo N0+N2;
  normal → N1 selectivo + N3; architectural/STRICT → +architecture/decisions/
  constraints; continuations → solo N2 delta (no reconstruir).
- Prohibiciones explícitas: L4 ephemeral, transcript, docs de dominio no
  relacionado, capsules superseded.
- Presupuesto global por paquete con reporte por nivel.
- Reemplaza las inyecciones fragmentadas (memoria operacional + contexto
  seleccionado + live) por un único Context Pack.

### Non-goals

Sin embeddings ni ML. El ensamblado sigue siendo determinístico por
keyword/domain match, clasificación del pre-flight y utility.

# Context Assembly Layer

## ADDED Requirements

### Requirement: Formal four-level context definition

WAM SHALL define four formal context levels with a canonical source, load rule, and prohibition for each.

#### Scenario: Level definition

* GIVEN the runtime loads context for a task
* THEN N0 Global/Policy SHALL be mandatory and minimal
* AND N1 Project SHALL be loaded selectively by task domain
* AND N2 Task SHALL be mandatory (live task state)
* AND N3 Session SHALL be loaded by relevance utility.

### Requirement: Task-driven selection

WAM SHALL select context for the current task instead of loading all available context.

#### Scenario: Unrelated exclusion

* GIVEN task A touches module auth
* AND task B touches module pagos
* WHEN context is assembled for task B
* THEN task A's task-specific context SHALL NOT enter the pack.

### Requirement: Classification-based loading

WAM SHALL adjust the context pack size and composition based on the pre-flight task classification.

#### Scenario: Trivial task

* WHEN a task is classified trivial
* THEN the pack SHALL contain only N0 and N2
* AND SHALL NOT load project documents or session capsules.

#### Scenario: Architectural task

* WHEN a task is classified architectural or STRICT
* THEN N1 SHALL include architecture, decisions and constraints
* AND the budget SHALL be allowed to grow.

### Requirement: Continuation without rebuild

WAM SHALL NOT rebuild the full context pack for continuation messages of an active task.

#### Scenario: Follow-up message

* GIVEN a task has an APPROVED contract
* WHEN a continuation message arrives
* THEN only N2 (live task delta) SHALL be loaded
* AND the previous pack SHALL NOT be reconstructed.

### Requirement: Prohibited context

WAM SHALL NOT inject ephemeral (L4), superseded capsules or unrelated-project transcripts into any pack.

#### Scenario: Ephemeral exclusion

* GIVEN an L4 ephemeral capsule exists
* WHEN a pack is assembled
* THEN it SHALL be excluded.

### Requirement: Pack observability

WAM SHALL report per-level budget usage and selection rationale for every assembled pack.

#### Scenario: Budget report

* WHEN a pack is assembled
* THEN the pack SHALL expose N0..N3 token usage
* AND the total SHALL respect the configured budget.
