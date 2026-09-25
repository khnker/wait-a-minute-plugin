# Specification: Runtime and Benchmark Hardening

## Overview
This spec defines the requirements and expectations for TASK-08 and TASK-10, focusing on mandatory output node handling and CWR evidence handling.

## TASK-08: requirement::output contract
**Objective**: Ensure the WAM Context Router treats nodes with `type: "output"` and `admission: "MANDATORY"` as required context.

**Requirements**:
1. The router SHALL include nodes of type "output" with `metadata.admission === "MANDATORY"` in the required set for context selection.
2. The router SHALL respect the admission class of such nodes and never drop them.
3. The benchmark test `tests/context-output-benchmark.test.mjs` SHALL verify SPR=1.0, COR=0, CWR=0 for a scenario with a mandatory output node.
4. The test SHALL use explicit `requires` edge in scenario.requires to ensure oracle closure verification.

## TASK-10: Real CWR with usedIds/usedTokens
**Objective**: Ensure Context Waste Rate (CWR) returns `null` when no evidence of used tokens or used IDs is provided.

**Requirements**:
1. `context-optimization-metrics.js` SHALL return `CWR = null` when both `input.usedIds` is not an array and `input.usedTokens` is not a number.
2. `context-optimization-metrics.js` SHALL compute CWR normally when either `usedIds` or `usedTokens` is provided.
3. The benchmark system SHALL propagate scenario `usedIds` when the selector returns `undefined`.
4. The test `context-optimization.test.mjs` SHALL verify CWR behavior with no evidence (CWR=null).

## Artifacts
- Task state: `TASK-08` and `TASK-10` marked as completed with validation records
- Test files: Updated imports and added requires edge in benchmark test
- Metrics file: Updated CWR calculation in record() function
- Router: Updated required set construction to include explicit MANDATORY nodes