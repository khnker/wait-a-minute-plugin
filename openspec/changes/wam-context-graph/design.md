# Design

## Context Node

Every context item is represented as a typed node.

```ts
type ContextNodeType =
  | "task"
  | "subtask"
  | "requirement"
  | "claim"
  | "action"
  | "observation"
  | "evidence"
  | "decision"
  | "constraint"
  | "artifact"
  | "output";
```

Each node contains:

```ts
interface ContextNode {
  id: string;
  type: ContextNodeType;
  content: string;
  taskId?: string;
  verified: boolean;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}
```

## Context Edge

Relationships are explicit and typed.

```ts
type ContextEdgeType =
  | "requires_completion"
  | "requires_output"
  | "requires_evidence"
  | "requires_decision"
  | "depends_on_artifact"
  | "produces"
  | "supports"
  | "contradicts"
  | "invalidates"
  | "related_to";

interface ContextEdge {
  from: string;
  to: string;
  type: ContextEdgeType;
  weight?: number;
}
```

### Important invariant

A task depends on an output from another task, not on the entire context of that task.

Example:

```
T1 ──produces──> O1
T2 ──requires_output──> O1
```

T2 should receive O1, not all context generated while executing T1.

### Evidence integrity

Verified evidence must remain addressable independently from derived summaries.

```
RAW EVIDENCE
      ↓
CANONICAL EVIDENCE
      ↓
DERIVED CONTEXT
      ↓
SUMMARY
```

Only derived context and summaries may be discarded freely.

## Storage

The initial implementation uses an in-memory graph suitable for tests.

Persistence is explicitly deferred.

The graph API must therefore remain storage-independent.
