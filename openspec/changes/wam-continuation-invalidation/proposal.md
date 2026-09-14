# Change: wam-continuation-invalidation

## Problema

El continuation fast-path evita reconstruir el Context Pack después de
aprobar un contrato.

Esto reduce coste, pero permite reutilizar contexto que puede haber
quedado obsoleto después de cambios relevantes durante la ejecución.

## Propuesta

Mantener el fast-path, pero invalidarlo mediante señales determinísticas.

Una continuación solo puede reutilizar el contexto anterior si el
context snapshot sigue siendo válido.

## Señales de invalidación

- cambios en archivos relevantes;
- cambios en package.json / lockfiles;
- cambios en configuración;
- cambios en arquitectura/decisions/constraints;
- cambio de branch o git revision;
- aparición de nuevos blockers;
- cambio de requirement;
- completion claim;
- explicit `/wam` operation.

## Objetivo

No reconstruir contexto por defecto.

Reconstruirlo únicamente cuando exista evidencia de que el contexto
anterior dejó de representar el estado actual.
