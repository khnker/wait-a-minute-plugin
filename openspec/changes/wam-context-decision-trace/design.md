# Design: Context Decision Trace

## Context
We need to make every context admission decision explainable by tracing:
- source (how the node was discovered)
- dependency path (chain of dependencies leading to inclusion)
- admission class (MANDATORY/CONDITIONAL/OPTIONAL)
- relevance score (computed by router)
- token cost (estimated by router)
- final assembly level (N0-N4)

## Decisions
Add trace collection at key points:
1. During graph traversal in resolveContext()
2. During admission classification
3. During budget allocation
4. During final assembly formatting

## Implementation
- Create a ContextDecisionTrace type
- Modify resolveContext to emit traces for considered nodes
- Enhance adapter to preserve and enhance traces
- Extend assembly to attach final level information
- Add diagnostic endpoint for trace lookup