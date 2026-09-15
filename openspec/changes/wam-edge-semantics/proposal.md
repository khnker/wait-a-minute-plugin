# Proposal: Edge Semantics

## Problem
Context Graph defines canonical edge types, but reconstructed graphs can introduce non-canonical relationships such as `depends_on`. Router traversal therefore depends on implementation-specific edge interpretation. This leads to inconsistent behavior when the Router processes different graph representations.

## Goal
Make edge direction and meaning explicit and enforceable. Ensure that every edge:
1. Uses a canonical edge type
2. Has documented source/target semantics
3. Is traversable consistently by graph operations

## Success Criteria
- No ad-hoc graph implementation exists in router-adapter.js.
- Task, requirement, decision, evidence, artifact and dependency relationships are reconstructed consistently.
- Edge types use Context Graph's canonical vocabulary.
- Router decisions are reproducible from persisted state.
