# Design

## Skill metadata

```js
{
  requirements: [],
  conflicts: [],
  platforms: [],
  tools: [],
  versions: []
}
```

## Routing

score(skill, task) → compatibility(skill, environment, task) → final candidates → selection

## Compatibility states

- COMPATIBLE
- INCOMPATIBLE
- UNKNOWN

UNKNOWN no significa compatible.

Para tareas de bajo riesgo puede continuar como candidato.

Para RIGOROUS: UNKNOWN → ASK/INVESTIGATE.

## Explain

/wam skills explain debe mostrar:

- score
- compatibility
- rejected constraints
- final selection
