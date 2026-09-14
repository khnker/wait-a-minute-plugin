# Change: wam-observation-provenance

## Objetivo

Toda observación operacional persistida debe conservar su procedencia.

## Schema

```js
{
  id,
  statement,
  source,
  sourceType,
  confidence,
  observedAt,
  validUntil,
  status
}
```

## sourceType

- COMMAND
- FILE
- TEST
- TOOL
- USER
- AGENT_INFERENCE

## Regla

AGENT_INFERENCE nunca puede convertirse automáticamente en KNOWN.

Una observación derivada de otra observación debe conservar lineage.
