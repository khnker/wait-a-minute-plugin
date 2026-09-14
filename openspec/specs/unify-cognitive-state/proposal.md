# Proposal: Unify Cognitive State

## Why

WAM currently has more than one representation of cognitive state across runtime, tests, and autonomy artifacts. This creates drift risk: hypotheses and experiments can be persisted through one path while consumers inspect another.

## What changes

Establish one canonical cognitive-state API and storage representation for:

- active hypotheses
- rejected hypotheses
- experiments
- observations
- compaction
- repeated-experiment detection

Runtime code, behavioral tests, and any reporting/diagnostic code SHALL consume this API instead of reading internal persistence files directly.

## Non-goals

- Do not add new autonomy capabilities.
- Do not change the semantics of hypotheses or experiments.
- Do not introduce a database.
