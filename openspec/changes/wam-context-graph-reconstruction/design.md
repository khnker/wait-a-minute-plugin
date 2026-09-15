# Design

Create a canonical module `context-graph-builder.js`:

```javascript
export function buildContextGraph(taskState, runState, evidenceState) {
  const g = new ContextGraph();
  // ... reconstruction logic ...
  return g;
}
```

The builder must use `ContextGraph` as the concrete graph implementation.

Canonical sources:
- Task State → task/requirements/constraints
- Run State → actions/observations/decisions
- Evidence Lineage → evidence/verification
- Task Dependencies → dependency relationships

`router-adapter.js` will be refactored to consume this `ContextGraph` instance.
