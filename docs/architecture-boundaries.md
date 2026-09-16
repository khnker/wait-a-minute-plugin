# Arquitectura WAM - Fronteras y Dependencias

Esta documentación define las fronteras arquitectónicas prohibidas para prevenir el acoplamiento circular y la mezcla de responsabilidades en el proyecto `wait-a-minute-plugin`.

## Capas Arquitectónicas

1.  **Runtime**: `index.js`, `router-adapter.js`, `context-router.js`
2.  **Domain Modules**:
    - `Task` (`engine.js`, `task-runs.js`)
    - `Preflight` (`preflight/*.js`)
    - `Contract` (`sufficiency-contract.js`)
    - `Context` (`context/*.js`, `memory.js`, `assembly.js`)
    - `Cognition` (`cognition/*.js`, `execution-engine.js`)
    - `Evidence` (`evidence/*.js`)
    - `Verification` (`verification/*.js`)
    - `Policy` (`policy/*.js`)
    - `Shared` (`formatting.js`, `logger.js`)

## Reglas de Dependencia (DAG)

- **Runtime** puede depender de **Domain Modules**.
- **Domain Modules** NO pueden depender de **Runtime** (`index.js`).
- **Capas inferiores** (Shared) NO pueden depender de **Capas superiores**.
- **Dependencias Circulares** estrictamente prohibidas.

## Fronteras Prohibidas

| Fuente | Destino | Tipo |
|---|---|---|
| `Cognition` | `index.js` | Prohibido |
| `Context` | `index.js` | Prohibido |
| `Verification` | `plugin hooks` | Prohibido |
| `Domain Module` | `Runtime` | Prohibido |
