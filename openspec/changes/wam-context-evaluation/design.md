# Design

## Benchmark strategies

### Full Context

All available context is provided.

This establishes the maximum-information baseline.

### Semantic Top-K

Context is selected using semantic similarity only.

This establishes the RAG-style baseline.

### WAM

Context is selected using:

- task scope
- dependency graph
- evidence
- verification
- semantic relevance
- token cost

## Test scenarios

### Scenario A — Noise

```
100 context nodes
5 directly relevant nodes
95 irrelevant nodes
```

Expected:
- WAM retrieves the relevant nodes
- Irrelevant context is rejected
- Required evidence remains present

### Scenario B — Hidden dependency

The required context has low semantic similarity but is connected through the dependency graph.

Expected:
- Semantic Top-K may miss it
- WAM follows the dependency and retrieves it

### Scenario C — Contradictory evidence

Two pieces of evidence disagree.

Expected:
- WAM does not silently collapse them
- Contradiction remains visible
- Unverified information cannot override verified evidence

### Scenario D — Stale evidence

A previous decision is invalidated by newer evidence.

Expected:
- Stale context is marked invalid
- Dependent context is invalidated or reopened

### Scenario E — Missing dependency

A task requires an output that does not exist.

Expected:
- complete = false
- missing = [required dependency]
- No context may be fabricated

### Scenario F — Playwright / Chromium failure

Model the real WAM failure case:

Task: Run Lider browser automation.
Agent assumption: Use Playwright + stealth.
Actual dependency: Specific Chromium installation is missing.

Expected:
- The router identifies the missing runtime dependency
- The task is not considered sufficiently contextualized
- WAM generates a ContextGap / Requirement
- Successful execution cannot be considered verified merely because the automation strategy looks correct

## Metrics

Collect:
- Context Recall
- Context Precision
- Token Count
- Dependency Coverage
- Evidence Coverage
- Missing Dependency Detection
- Task Completion
- Verification Success

Primary metric: Task Success / Context Tokens

But task correctness has priority over token reduction.

## Output

Each benchmark produces a machine-readable result:

```ts
interface ContextEvaluation {
  strategy: string;
  taskSuccess: boolean;
  verificationSuccess: boolean;
  contextTokens: number;
  contextRecall: number;
  contextPrecision: number;
  dependencyCoverage: number;
  evidenceCoverage: number;
  missingDependencies: string[];
}
```

The benchmark must make regressions visible rather than optimizing them away.
