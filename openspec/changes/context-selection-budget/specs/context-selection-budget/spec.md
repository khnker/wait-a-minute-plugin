# Context Selection and Budget

## Proposal

### Context

Una memoria estructurada resuelve dónde guardar conocimiento, pero no resuelve qué debe recibir el agente para una tarea concreta.

Cargar todo el contexto disponible recrearía el problema original: el agente recibiría información históricamente relacionada pero operacionalmente irrelevante.

La investigación disponible sobre selección de contexto bajo presupuesto apunta precisamente a optimizar relevancia, cobertura y redundancia bajo un límite de tokens, y a medir utilidad final en lugar de únicamente recall.

### Why

WAM debe tratar el contexto enviado al agente como un recurso limitado.

La regla debe ser:

> El agente recibe el contexto mínimo suficiente para ejecutar la tarea con seguridad.

La selección debe considerar al menos:

* relevancia para la tarea;
* importancia;
* dependencia;
* freshness;
* confianza;
* redundancia;
* costo en tokens.

### What Changes

Introduce un `Context Selector` que:

1. recibe la tarea actual;
2. clasifica qué conocimiento necesita;
3. carga L1 como contexto base;
4. selecciona cápsulas relevantes de L2/L3;
5. resuelve dependencias;
6. elimina redundancia;
7. respeta un presupuesto de contexto;
8. construye un `Context Package`;
9. permite recuperación adicional bajo demanda.

El selector no debe asumir que todo contexto importante es relevante para toda tarea.

### Context value

La selección debe considerar una función conceptual equivalente a:

`utility = relevance × importance × freshness × confidence / token_cost`

La fórmula concreta puede evolucionar posteriormente.

### Non-goals

No se requiere inicialmente:

* embeddings;
* ML;
* búsqueda vectorial;
* optimización submodular formal;
* aprendizaje del selector.

La primera implementación debe permitir medir el comportamiento de un selector determinístico antes de introducir optimización adicional.

# Context Selection and Budget

## ADDED Requirements

### Requirement: Task-specific context package

WAM SHALL construct a context package specifically for the current task instead of forwarding all available persistent context.

#### Scenario: Narrow task

* GIVEN a project contains many persisted context capsules
* WHEN the agent receives a narrow task
* THEN WAM SHALL include only capsules relevant to that task
* AND SHALL exclude unrelated project and historical context.

### Requirement: Foundation-first loading

WAM SHALL consider L1 Foundation context before selecting task-specific context.

#### Scenario: Task starts

* WHEN WAM prepares context for a task
* THEN L1 Foundation SHALL be loaded or evaluated first
* AND subsequent context selection SHALL build on that foundation.

### Requirement: Relevance over historical proximity

WAM SHALL prefer task relevance over chronological proximity when selecting persistent context.

#### Scenario: Recent but irrelevant context

* GIVEN a recent capsule is unrelated to the current task
* WHEN an older capsule directly explains the current task
* THEN the older relevant capsule SHALL be preferred.

### Requirement: Dependency completeness

WAM SHALL include required dependencies of selected context capsules.

#### Scenario: Selected decision

* GIVEN a selected decision references a required architectural constraint
* WHEN the context package is assembled
* THEN the dependency SHALL be included unless it is already represented by another selected capsule.

### Requirement: Redundancy control

WAM SHALL avoid including multiple capsules that convey substantially duplicate information.

#### Scenario: Duplicate context

* GIVEN multiple capsules contain equivalent knowledge
* WHEN WAM builds the context package
* THEN it SHALL prefer the highest-value representation
* AND SHALL omit redundant copies.

### Requirement: Context budget

WAM SHALL support an explicit context budget.

#### Scenario: Budget exceeded

* GIVEN candidate context exceeds the configured budget
* WHEN WAM assembles the context package
* THEN it SHALL prioritize higher-value context
* AND SHALL not exceed the budget solely because additional historical context exists.

### Requirement: On-demand retrieval

WAM SHALL support retrieving additional context after initial context assembly.

#### Scenario: Agent requires missing context

* GIVEN the initial context package is insufficient
* WHEN the agent requests additional contextual information
* THEN WAM SHALL search persisted context
* AND SHALL return only the additional context relevant to the request.

### Requirement: Insufficiency disclosure

WAM SHALL distinguish "context not loaded" from "context does not exist".

#### Scenario: Missing context

* WHEN no suitable capsule can be found
* THEN WAM SHALL report that the required context is unavailable
* AND SHALL NOT fabricate a context capsule to satisfy the request.

### Requirement: Selection observability

WAM SHALL record which context capsules were selected and why.

#### Scenario: Context package generated

* WHEN WAM builds a context package
* THEN it SHALL record selected capsule IDs
* AND SHALL record the selection rationale or classification
* AND SHALL record the effective context budget.

### Requirement: Context sufficiency

WAM SHALL evaluate whether the selected package contains sufficient context for the task before execution.

#### Scenario: Insufficient package

* WHEN WAM determines that critical required context is missing
* THEN it SHALL retrieve additional context or explicitly surface the insufficiency
* AND SHALL not silently proceed as though the context were complete.
