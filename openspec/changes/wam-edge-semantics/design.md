# Design: Edge Semantics

## Context
Context Graph defines canonical edge types, but reconstructed graphs can introduce non-canonical relationships such as `depends_on`. Router traversal depends on implementation-specific edge interpretation.

## Goals / Non-Goals
- Make edge direction and meaning explicit and enforceable.
- Ensure that every edge uses a canonical edge type and has documented source/target semantics.

## Decisions
Define an edge contract that maps relationships to canonical types.

## Edge Contract
- Task → requires_output → Output
- Requirement → requires_evidence → Evidence
- Action → produces → Observation
- Observation → supports → Evidence
- Task → requires_decision → Decision
- Artifact → produces → Output

For each edge type, define:
- source type
- target type
- semantic direction
- upstream behavior
- downstream behavior

## Risks / Trade-offs
- Migration of legacy edges might require updates to existing tests.
- Strict validation might reject some valid historical data.

## Migration Plan
- Add validation at `addEdge()`.
- Remove non-canonical `depends_on`.
- Fix Router traversal according to canonical direction.

## Open Questions
How to handle existing graphs with non-canonical edges during migration?
