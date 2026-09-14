# Change: Autonomy Memory

## Objective
Persist operational cognitive state (hypotheses, experiments, observations) across sessions and context compactions.

## Design
Extend existing `memory.js` to serialize `CognitiveState` into the `.wam/task/state.yaml` or a dedicated `cognition.json`.

## Plan
1. Create design docs.
2. Update `memory.js` to include `CognitiveState` in serialization.
3. Update context assembly to inject compact cognitive summary on session resume.
