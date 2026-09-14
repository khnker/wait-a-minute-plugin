# Design

```js
{
  taskId,
  conditions: [
    {
      id,
      type,
      description,
      status,
      source
    }
  ]
}
```

Status:

- SATISFIED
- MISSING
- BLOCKED
- UNKNOWN

## Regla

sufficiency = OK solamente cuando todas las condiciones
MANDATORY están SATISFIED.

## Backward compatibility

Los keyword checks actuales permanecen como heurística de discovery,
pero no como autoridad final.
