# Session Context Continuity

## Proposal

### Context

La fundación actual de WAM exige comenzar una sesión leyendo el estado compartido y terminar escribiendo progreso.

Con Context Capsules, este protocolo puede evolucionar de una lectura de archivos completos hacia una inicialización contextual explícita.

### Why

Una sesión nueva debe comenzar con el conocimiento estable necesario para entender el proyecto, no con el historial de la sesión anterior.

L1 Foundation constituye el "mapa mental mínimo" del proyecto.

A partir de ese mapa, WAM debe identificar la tarea actual y recuperar únicamente el contexto adicional necesario.

### What Changes

El lifecycle de una sesión pasa a ser:

```text
CREATE SESSION
    ↓
LOAD L1 FOUNDATION
    ↓
UNDERSTAND CURRENT TASK
    ↓
SELECT MINIMUM SUFFICIENT CONTEXT
    ↓
EXECUTE
    ↓
ON-DEMAND CONTEXT RETRIEVAL
    ↓
EXTRACT DURABLE KNOWLEDGE
    ↓
PROMOTE / UPDATE / INVALIDATE
    ↓
WRITE SESSION LOG
```

La sesión anterior no se carga automáticamente completa.

Su conocimiento durable puede estar disponible mediante L1/L2/L3 y recuperación bajo demanda.

### Promotion

Al finalizar una sesión, WAM puede identificar conocimiento candidato a persistencia.

La promoción debe ser conservadora:

* L4 → descartable;
* L3 → permanecer en sesión;
* L3 → L2 cuando exista reutilización demostrable;
* L2 → L1 únicamente cuando sea estable, fundamental y suficientemente validado.

La promoción a L1 no debe ocurrir silenciosamente.

### Compatibility

Las reglas actuales de WAM sobre `state.md`, `goals.md`, `log.md` y `decisions.md` no se eliminan.

El nuevo sistema debe complementar esas estructuras y evolucionar gradualmente su uso.

# Session Context Continuity

## ADDED Requirements

### Requirement: Session initialization

A new WAM session SHALL initialize its contextual state using L1 Foundation context before loading lower-level contextual information.

#### Scenario: New session

* GIVEN a project contains L1 Foundation capsules
* WHEN a new session starts
* THEN WAM SHALL load the applicable L1 Foundation context first
* AND SHALL use it to establish the project's current conceptual baseline
* AND SHALL NOT automatically load the complete previous session transcript.

### Requirement: Foundation as stable project map

L1 Foundation SHALL contain only high-value knowledge required to understand the project's purpose, constraints and fundamental decisions.

#### Scenario: Foundation review

* WHEN a capsule is considered for L1
* THEN WAM SHALL evaluate its importance, stability, reuse potential and provenance
* AND unstable or task-specific information SHALL remain outside L1.

### Requirement: Session isolation

A new session SHALL receive a new `session_id` unless it explicitly resumes an existing session.

#### Scenario: Separate sessions

* GIVEN session A has ended
* WHEN session B starts independently
* THEN session B SHALL receive a distinct session ID
* AND SHALL access durable knowledge through the context hierarchy rather than inheriting session A's transcript.

### Requirement: Session-specific context

L3 context SHALL remain associated with its originating session unless explicitly promoted.

#### Scenario: Session-only discovery

* GIVEN an exploratory finding is useful only to the current task
* WHEN the session ends
* THEN the finding SHALL remain session-scoped unless a promotion decision is made.

### Requirement: Context promotion

WAM SHALL support explicit promotion of durable knowledge between context levels.

#### Scenario: Reusable session knowledge

* GIVEN a session capsule has demonstrated project-wide reuse value
* WHEN promotion is approved
* THEN WAM SHALL allow promotion from L3 to L2.

#### Scenario: Foundation promotion

* GIVEN a capsule represents a stable and fundamental project fact or decision
* WHEN promotion to L1 is approved
* THEN WAM SHALL allow the capsule to become Foundation context
* AND SHALL preserve its provenance and promotion evidence.

### Requirement: Session close

WAM SHALL close a session by recording its progress and evaluating newly created contextual knowledge.

#### Scenario: Session completion

* WHEN a WAM session ends
* THEN WAM SHALL persist session progress
* AND SHALL identify candidate durable knowledge
* AND SHALL preserve the session's unique identity
* AND SHALL not automatically promote all session content.

### Requirement: Cross-session retrieval

A new session SHALL be able to retrieve relevant knowledge from previous sessions without loading their complete history.

#### Scenario: Follow-up work

* GIVEN session A created an architectural decision
* AND session B later works on the same subsystem
* WHEN WAM selects context for session B
* THEN the decision from session A SHALL be eligible for retrieval
* AND unrelated session A history SHALL remain unloaded.

### Requirement: Context provenance across sessions

Retrieved context from a previous session SHALL retain its original provenance and originating session.

#### Scenario: Historical decision

* WHEN session B loads a decision created in session A
* THEN WAM SHALL expose that the capsule originated in session A
* AND SHALL preserve the original evidence reference.
