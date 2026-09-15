# Specs: Context Graph Reconstruction

## Requirement 1: Canonical Graph Reconstruction
- The system must provide a unified mechanism to reconstruct the Context Graph from persisted runtime state (Task, Run, Evidence, Dependencies).
- This reconstruction must happen centrally, not inside the Router Adapter.
- The resulting graph must be an instance of `ContextGraph`.

## Requirement 2: Semantic Integrity
- The reconstruction must preserve all semantic relationships:
    - Task dependencies
    - Decision history
    - Evidence lineage
    - Artifact producers
- All relationships must be mapped to the canonical edge types defined in `context-graph.js`.
- No ad-hoc or non-canonical edge types (like `depends_on`) are allowed in the graph.

## Requirement 3: Determinism
- The reconstruction process must be deterministic: given the same runtime state, it must produce an equivalent `ContextGraph`.
- The graph structure (nodes and edges) must be identical across runs if the underlying state hasn't changed.

## Requirement 4: Decoupling
- `router-adapter.js` must only consume a `ContextGraph`. It must not define graph semantics or perform reconstruction.
