# Design

Cada capsule puede tener:

```js
{
  createdAt,
  lastVerifiedAt,
  validity,
  applicability
}
```

## Validity

- VALID
- STALE
- INVALIDATED
- SUPERSEDED

## Applicability

- GLOBAL
- PROJECT
- TASK
- STAGE
- ARTIFACT

## Routing

priority = validity × applicability × relevance × confidence × freshness

Freshness nunca puede convertir INVALIDATED en candidato válido.

## Verification

Una capsule puede ser:

old + VALID

y debe seguir siendo utilizable.
