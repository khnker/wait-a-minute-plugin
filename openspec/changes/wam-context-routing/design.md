# Design

## API

```ts
interface ResolveContextOptions {
  taskId: string;
  maxTokens?: number;
}

interface ResolvedContext {
  nodes: ContextNode[];
  edges: ContextEdge[];

  requirements: Requirement[];
  missing: ContextGap[];

  complete: boolean;

  tokenEstimate: number;
}
```

### Main operation

```ts
resolveContext(
  graph: ContextGraph,
  options: ResolveContextOptions
): ResolvedContext
```

## Resolution pipeline

```
CURRENT TASK
     ↓
TASK SCOPE
     ↓
DIRECT REQUIREMENTS
     ↓
DEPENDENCY RESOLUTION
     ↓
REQUIRED OUTPUTS
     ↓
EVIDENCE RESOLUTION
     ↓
POLICY FILTER
     ↓
CONTEXT RANKING
     ↓
MINIMUM SUFFICIENT CONTEXT
```

## Dependency expansion

The router must prioritize:

1. directly required outputs
2. evidence supporting those outputs
3. constraints affecting the task
4. decisions required by the task
5. relevant observations
6. related context

Downstream context must not normally be injected.
It may be exposed separately for impact analysis.

## Ranking

Initial ranking is deterministic.

Conceptually:

```
utility =
  relevance
  × dependencyStrength
  × verification
  × freshness
  / tokenCost
```

The exact scoring function should remain replaceable.

## Missing context

If a required dependency cannot be resolved:

```ts
{
  complete: false,
  missing: [...]
}
```

The router must not infer or fabricate the missing information.
Instead it creates or returns a structured ContextGap.

## Verification

Unverified claims must not be treated as equivalent to verified evidence.

If verified and unverified information conflict, the router must preserve the conflict instead of silently selecting one.

## Determinism

Given the same graph and task state, routing must produce the same result.

This is important for reproducible tests and future A/B evaluation.
