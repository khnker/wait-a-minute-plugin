# Design

Crear un Context Snapshot:

```js
{
  taskId,
  gitRevision,
  relevantFilesHash,
  projectContextHash,
  taskStateHash,
  createdAt
}
```

En cada continuation:

1. calcular señales baratas;
2. comparar snapshot;
3. si no cambió nada relevante → fast-path;
4. si cambió algo relevante → rebuild parcial;
5. si cambió estado crítico → rebuild completo.

## Estados

- VALID
- STALE
- INVALID

## Regla

El fast-path es una optimización.
Nunca es una autoridad sobre el estado actual.

## Rebuild parcial

Si solo cambió N1:
mantener N2 + reconstruir N1/N3.

Si cambió Task State:
reconstruir N2 + contexto dependiente.

Si cambió arquitectura/constraints:
reconstruir N1 + N3.
