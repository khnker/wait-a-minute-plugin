# Context Assembly Layer — Design

## Niveles formales

| Nivel | Fuente canónica | Carga | Obligación |
|---|---|---|---|
| N0 Global/Policy | policies activas (scope/verify/simplify) | siempre | obligatorio |
| N1 Project | .wam/context/{project,architecture,decisions,constraints,recent-changes} | por dominio/clasificación | selectivo |
| N2 Task | .wam/tasks/<id>/state.yaml → live | siempre (delta) | obligatorio |
| N3 Session | capsules L1/L2/L3 | utility | selectivo |

## Reglas por clasificación

- trivial → N0 + N2
- normal → N0 + N1 (recent-changes resumido + decisions/constraints si match) + N2 + N3
- architectural/STRICT → + architecture + decisions + constraints, budget ampliado
- continuation (contract APPROVED) → solo N2 delta

## Prohibido

L4, superseded, transcript, docs de dominio sin match, capsules sin contenido.

## Presupuesto

contextBudget global (default 4000 tok) con corte por nivel (N0 primero,
N1 selectivo, N2 siempre, N3 por utility). Reporte {N0..N3} por paquete.
