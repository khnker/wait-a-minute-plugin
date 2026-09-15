## MODIFIED Requirements: wam-router-admission

### Requirement: Node Admission Invariant
The `Admission` class MUST ensure that all MANDATORY nodes are present before allowing execution to continue, defined as "execution cannot safely proceed without this node."

### Requirement: Admission Precedence
Admission decisions MUST follow this hierarchy (1 highest, 6 lowest):
1) Dependencia de ejecución explícita
2) Dependencia de completación
3) Evidencia requerida para verificación
4) Decisión requerida
5) Soporte condicional
6) Contexto opcional

#### Scenario: Mandatory node missing (via Precedence)
- WHEN: A request for execution is received.
- AND: A node with a higher-precedence mandatory requirement is missing.
- THEN: The `Admission` class MUST reject the request, regardless of lower-precedence node types present.
