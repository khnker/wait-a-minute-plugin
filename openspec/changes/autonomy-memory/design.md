# Design: Autonomy Memory

## Cognitive State Model
```yaml
cognition:
  activeHypotheses:
    - id: H1
      statement: "Taxonomy normalization drops weight"
      confidence: 0.62
      status: testing
  rejectedHypotheses:
    - id: H0
      statement: "Network timeout"
      reason: "Failed experiment E1"
  recentExperiments:
    - id: E2
      hypothesis: H1
      action: "log normalization output"
      result: completed
  criticalObservations:
    - id: O3
      fact: "Weight field is null after normalization"
      relevance: high
```

## Persistence
Cognitive state is persisted to:
- `.wam/task/cognition.json`

Loaded on:
- Task resume (chat.message hook)
- Context assembly (N2 layer)

## Memory compaction rules
- KEEP: active hypotheses, rejected hypotheses, completed experiments, critical observations.
- DROP: redundant observations, transient narration.
- NEVER convert: hypothesis → fact, interpretation → evidence.
