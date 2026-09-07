# Design: Hypothesis Experiment Loop

## 1. Loop
The runtime supports:
OBSERVE → HYPOTHESIZE → EXPERIMENT → OBSERVE → EVALUATE → REPLAN

## 2. Hypothesis lifecycle
- Statuses: proposed → testing → supported | rejected | inconclusive
- Each hypothesis has confidence (0..1).
- WAM persists rejected hypotheses (so the agent does not silently retry).

## 3. Experiment lifecycle
- Statuses: proposed → running → completed | failed | aborted
- Linked to hypothesis via hypothesisId.
- Risk: SAFE / GUARDED / BLOCKED (delegated to risk-engine).
- Reversibility is required for autonomous execution.

## 4. Observation model
Each experiment produces an observation with:
- result (string)
- facts (array)
- unexpected (array)

Observations MUST be linked to experimentId.

## 5. Replanning triggers
- Hypothesis rejected
- Experiment failed
- Verification failure
- Discovery of new constraint

## 6. Persistence
State lives under `.wam/tasks/<taskId>/cognition/`:
- hypotheses.jsonl
- experiments.jsonl
- observations.jsonl

JSONL allows append-only compaction.
