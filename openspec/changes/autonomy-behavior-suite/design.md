# Design: Autonomy Behavior Suite

## Architecture
3 levels:
- Level 1: Unit (existing tests)
- Level 2: Contract/Integration (new suite)
- Level 3: Behavioral Runtime (new suite)

## 15 Scenarios
01. Approval Continuity
02. Tactical Recovery
03. Dependency Recovery
04. Runtime Configuration Recovery
05. Reference-Guided Recovery
06. MCP Evidence
07. Unexpected Empty Result
08. Strategy Change
09. Risk Block With Recovery
10. Configuration/Process Collision
11. Repeated Experiment
12. Context Recovery
13. Scope Preservation
14. False Completion
15. Autonomous End-to-End Recovery

## Test Philosophy
Behavioral outcomes, NOT exact tool sequences. The suite validates invariants:
- approvalRequests <= expected
- strategyChanges == expected
- riskViolations == 0
- scopeViolations == 0
- repeatedExperiments == 0
- completionEvidence >= required
- referenceEvidenceUsed == expected

## Deterministic Harness
- scenario({ name, initialState, approvedStrategy, environment, availableEvidence, toolResponses, expectedBehavior })
- Event trace collector (STRATEGY_APPROVED, TOOL_CALL, HYPOTHESIS_CREATED, EXPERIMENT_FAILED, etc.)
- Deterministic tool responses (no real network/time)
