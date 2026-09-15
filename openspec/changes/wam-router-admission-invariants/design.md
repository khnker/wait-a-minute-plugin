## Context
The WAM Router needs strict admission control to ensure system stability. Currently, the `Admission` class logic is too coupled with the node type, misclassifying causal dependencies.

## Goals / Non-Goals
- Goal: Enforce mandatory presence based on causal dependency precedence, not node type.
- Non-Goal: Refactor the entire node type system.

## Decisions
- [Decision] Implement hierarchical admission precedence in `Admission` class:
  1) Dependencia de ejecución explícita
  2) Dependencia de completación
  3) Evidencia requerida para verificación
  4) Decisión requerida
  5) Soporte condicional
  6) Contexto opcional

## Risks / Trade-offs
- [Risk] Impact on existing validation logic → Mitigation: Unit tests for each precedence level.

## Migration Plan
- 1. Update `Admission` validation logic to implement precedence hierarchy.
- 2. Add test cases verifying all 6 levels.
