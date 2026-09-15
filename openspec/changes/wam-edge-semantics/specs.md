## Requirement 1: Canonical Edge Validation
- The `ContextGraph.addEdge()` function must validate that the edge type is one of the canonical types defined in `EDGE_TYPES`.
- Invalid edges must throw an error or be rejected.

## Requirement 2: Directionality Enforcement
- Edges must have clear directionality defined in the graph traversal.
- `getUpstream` and `getDownstream` must follow canonical semantics.
- Source/target compatibility must be validated at edge creation.

## Requirement 3: Legacy Compatibility
- Existing graphs with non-canonical edge types (e.g., `depends_on`) must be flagged or rejected.
- A migration path or validation rule must be defined.
