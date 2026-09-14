# Change: add-decision-capture-protocol

## Proposal

### Why

WAM actualmente tiene la infraestructura para capturar decisiones técnicas mediante el `ContextDecisionTracer` y el archivo `decisions.md`, pero en la práctica no se está utilizando para registrar decisiones reales de arquitectura, diseño o implementación. En su lugar, `decisions.md` contiene únicamente metadatos de sesión (como la aprobación de la estrategia de contract). Esto significa que la promesa de WAM como "fuente de verdad" para decisiones técnicas no se está cumpliendo.

Este cambio introduce un protocolo obligatorio de captura de decisiones técnicas que el agente debe seguir al tomar decisiones que afecten a la arquitectura, API, datos, seguridad, compatibilidad, scope o acciones destructivas. El protocolo obliga a registrar:

- `rationale`: por qué se tomó la decisión.
- `alternatives`: qué otras opciones se consideraron y por qué se rechazaron.
- `evidence`: qué se observó o midió para sustentar la decisión.

El objetivo es convertir `decisions.md` y los logs de trazabilidad en un registro auténtico de decisiones técnicas, no solo de eventos de sesión.

### Scope

Este change incluye:

1. Definición clara de qué constituye una "decisión técnica" que debe ser capturada.
2. Protocolo de registro en `decisions.md` (formato YAML frontmatter + cuerpo descriptivo).
3. Integración con el `ContextDecisionTracer` para generar logs machine-verificables en `.wam/traces/`.
4. Validación de que las decisiones capturadas contienen los campos obligatorios.
5. Tests unitarios y de integración.

Este change no incluye:

* cambios al sistema de contexto N0–N3;
* cambios al Verification Engine (WAM 1.1);
* detección automática de decisiones mediante LLM;
* almacenamiento de evidencia completa (solo referencias o hashes);
* mecanismo de revisión o aprobación de decisiones por humanos.

### Supersedes

Este change no reemplaza ningún change existente, sino que complementa los cambios de WAM 1.1 (verificación de tareas) y WAM 1.0 (taxonomía canónica) al asegurar que el contenido semántico de `.wam/context/decisions.md` y `.wam/traces/` sea significativo.