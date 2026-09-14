# Design

## Admission

Cada item tiene:

```js
{
  admission: "MANDATORY" | "CONDITIONAL" | "OPTIONAL",
  reason,
  tokenCost
}
```

## Orden

1. MANDATORY
2. CONDITIONAL
3. OPTIONAL

## Cuando MANDATORY excede budget

1. eliminar OPTIONAL;
2. reducir CONDITIONAL;
3. compactar si existe representación segura;
4. si aún no cabe → `sufficiency = insufficient`.

## Nunca

MANDATORY → omitido → continuar como si nada.

## Rationale

Registrar:

- budget-exceeded
- mandatory-preserved
- optional-dropped
- dependency-preserved
- sufficiency-failed
