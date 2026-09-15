# Context Graph Reconstruction

## Problem
The Router currently receives a graph reconstructed from task state. The reconstructed graph contains only the task and requirement/output nodes and does not preserve the full Context Graph semantics. This can cause routing decisions to be based on an incomplete graph.

## Goal
Define one canonical reconstruction path from persisted runtime state to Context Graph. The reconstructed graph must preserve semantic relationships required by the Router.

## Success Criteria
- No ad-hoc graph implementation exists in router-adapter.js.
- Task, requirement, decision, evidence, artifact and dependency relationships are reconstructed consistently.
- Edge types use Context Graph's canonical vocabulary.
- Router decisions are reproducible from persisted state.
