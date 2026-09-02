# Context Memory Model

## Proposal

### Context

WAM actualmente modela el estado de colaboración mediante archivos compartidos como `state.md`, `goals.md`, `log.md` y `decisions.md`. La fundación establece que estos archivos representan el estado compartido entre humano y AI y que `state.md` y `goals.md` deben leerse al comenzar cada sesión.

Este modelo funciona para mantener continuidad, pero no distingue adecuadamente entre:

* información fundamental y estable;
* conocimiento específico de una tarea;
* contexto propio de una sesión;
* información temporal o exploratoria;
* historial conversacional que ya no tiene valor operativo.

El resultado potencial es que la continuidad se obtenga mediante acumulación de historial en lugar de mediante recuperación selectiva de conocimiento.

### Why

WAM debe evolucionar desde un modelo de "estado almacenado" hacia un modelo de **conocimiento contextual estructurado**.

La unidad persistente no debe ser una conversación completa, sino una **Context Capsule**: una pieza identificable de conocimiento con propósito, alcance, importancia, procedencia, estabilidad y relaciones.

Esto permite que WAM conserve contexto sin asumir que todo el historial sigue siendo relevante.

### What Changes

Introduce:

1. `session_id` único para cada sesión.
2. `context_id` único para cada Context Capsule.
3. Context Capsules como unidad persistente de conocimiento.
4. Niveles jerárquicos:

   * `L1 Foundation`
   * `L2 Working`
   * `L3 Session`
   * `L4 Ephemeral`

5. Metadata obligatoria:

   * purpose
   * scope
   * importance
   * confidence
   * provenance
   * freshness
   * mutation_rate
   * reuse_probability
   * dependencies
   * supersedes
   * retrieval hints

6. Lifecycle explícito:

   * candidate
   * active
   * superseded
   * stale
   * invalidated

7. Provenance explícita:

   * `user_decided`
   * `observed`
   * `inferred`

8. Relaciones entre cápsulas.
9. Separación estricta entre historial conversacional y memoria persistente.

### Non-goals

Este change no introduce:

* vector database;
* embeddings obligatorios;
* búsqueda semántica avanzada;
* selección automática de contexto;
* promoción automática a L1;
* compresión automática de conversaciones.

Esos comportamientos pertenecen a changes posteriores.

### Impact

El modelo de memoria existente debe evolucionar sin eliminar la información histórica existente.

Las estructuras actuales de estado siguen siendo válidas como representación legible por humanos. Las Context Capsules proporcionan una capa adicional estructurada para recuperación selectiva.

La promoción hacia L1 debe ser conservadora. Una inferencia del agente no puede convertirse silenciosamente en una verdad fundamental del proyecto.

### Spec delta

# Context Memory Model

## ADDED Requirements

### Requirement: Unique session identity

WAM SHALL assign every collaboration session a unique `session_id`.

#### Scenario: New session

* WHEN a new WAM session starts
* THEN WAM SHALL create or accept a unique session identifier
* AND the identifier SHALL remain stable for the lifetime of that session
* AND subsequent context artifacts created during the session SHALL reference that `session_id`.

#### Scenario: Session continuation

* WHEN an existing session is explicitly resumed
* THEN WAM SHALL preserve the existing `session_id`
* AND SHALL NOT create a second identity for the same logical session.

### Requirement: Context capsule identity

Every persisted contextual knowledge unit SHALL have a unique `context_id`.

#### Scenario: Persisting context

* WHEN WAM persists reusable knowledge
* THEN it SHALL assign a unique `context_id`
* AND the identifier SHALL remain stable across updates to the capsule.

### Requirement: Context capsule metadata

Every active Context Capsule SHALL declare its purpose, scope, importance, confidence, provenance and lifecycle state.

#### Scenario: Inspecting a capsule

* WHEN WAM loads a Context Capsule
* THEN the capsule SHALL expose enough metadata to determine what the information is for
* AND whether it is safe to use
* AND whether it may be stale
* AND where the information originated.

### Requirement: Context hierarchy

WAM SHALL classify persistent context into four hierarchical levels.

#### Scenario: Foundation context

* WHEN context represents stable, high-value knowledge required to understand the project
* THEN it SHALL be eligible for `L1 Foundation`.

#### Scenario: Working context

* WHEN context is reusable project or task knowledge but is expected to mutate more frequently than foundation knowledge
* THEN it SHALL belong to `L2 Working`.

#### Scenario: Session context

* WHEN context is primarily relevant to one collaboration session
* THEN it SHALL belong to `L3 Session`.

#### Scenario: Ephemeral context

* WHEN context is temporary, speculative or unlikely to be reused
* THEN it SHALL belong to `L4 Ephemeral`
* AND it SHALL NOT be treated as durable project memory.

### Requirement: Provenance

WAM SHALL distinguish user decisions, observed evidence and agent inferences.

#### Scenario: Inferred knowledge

* WHEN a capsule is based primarily on agent inference
* THEN its provenance SHALL be `inferred`
* AND it SHALL NOT be silently promoted to L1.

### Requirement: Supersession

WAM SHALL preserve historical context when a capsule is replaced.

#### Scenario: Changed decision

* WHEN a new capsule replaces an existing decision
* THEN the previous capsule SHALL remain addressable
* AND SHALL reference the newer capsule through a supersession relationship
* AND the previous capsule SHALL no longer be considered current.

### Requirement: Freshness

WAM SHALL represent whether a context capsule is current, stale or invalidated.

#### Scenario: Stale context

* WHEN evidence indicates that a capsule may no longer represent the current project state
* THEN WAM SHALL mark it stale
* AND SHALL prevent stale status from being interpreted as current truth without verification.

### Requirement: Historical separation

WAM SHALL NOT treat the complete conversation transcript as persistent project context by default.

#### Scenario: Long conversation

* WHEN a session contains a large amount of conversational history
* THEN only knowledge explicitly extracted as reusable context SHALL become durable memory
* AND the remaining transcript SHALL remain session history rather than automatically entering future context.
