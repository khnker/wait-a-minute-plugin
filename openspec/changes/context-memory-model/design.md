# Context Memory Model — Design

## Goal

Evolucionar la memoria de WAM de "estado almacenado" (archivos .md) a
Context Capsules estructuradas: unidades persistentes con identidad, nivel,
provenance, freshness y lifecycle — sin vector DB ni embeddings.

## Modelo

Cápsulas en `.wam/capsules/<context_id>.json`; sesión en `.wam/session.json`.

```
Capsule {
  context_id, session_id, level (L1-L4), lifecycle,
  purpose, scope, importance (1-10), confidence (0-1),
  provenance (user_decided|observed|inferred),
  created_at, updated_at, mutation_rate, reuse_probability,
  dependencies[], supersedes, superseded_by, retrieval_hints[],
  content, evidence
}
```

## Niveles y lifecycle

- L1 Foundation (estable, alta importancia) | L2 Working (reusable, muta)
- L3 Session (relevante a una sesión) | L4 Ephemeral (descartable)
- lifecycle: candidate → active → superseded|stale|invalidated
- supersession preserva la cápsula anterior (addressable, no current)

## Promoción (conservadora)

- inferred nunca a L1 silenciosamente (requiere aprobación explícita)
- L3→L2 con reuso demostrable; L2→L1 con evidencia + aprobación
- L4 descartable

## Historial vs memoria

El transcript conversacional NO entra al modelo; solo extracción explícita
vía createCapsule (change 3 / CLI / hooks DONE).
