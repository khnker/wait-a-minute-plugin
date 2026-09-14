# Change: add-verifiable-task-completion

## Proposal

### Why

WAM actualmente permite marcar un requirement como `verified` mediante evidencia textual proporcionada por el agente.

Esto crea una diferencia entre:

* lo que el agente afirma haber hecho;
* lo que realmente ejecutó;
* lo que WAM puede observar;
* lo que WAM puede verificar.

El Completion Gate debe impedir que `DONE` dependa únicamente de una declaración del agente.

WAM 1.1 introduce un Verification Engine mínimo que ejecuta checks explícitamente definidos en el Completion Contract y genera evidencia machine-verifiable.

El objetivo no es convertir WAM en un sistema general de CI/CD, sino establecer una frontera confiable entre:

```text
CLAIM
  ↓
ACTION
  ↓
OBSERVATION
  ↓
EVIDENCE
  ↓
VERIFIED
```

### Scope

Este change incluye:

1. Modelo de Verification Check.
2. Ejecución controlada de checks.
3. Modelo de Evidence.
4. Asociación entre requirements y checks.
5. Estados `IMPLEMENTED`, `VERIFYING`, `VERIFIED`.
6. Validación de evidencia.
7. Integración con Completion Gate.
8. Captura del estado del repositorio asociado a la evidencia.
9. Timeouts y límites de output.
10. Tests unitarios e integración.

Este change no incluye:

* embeddings;
* vector database;
* nuevo LLM;
* skill telemetry;
* scope-drift detection;
* review engine;
* cambios al sistema N0–N3;
* CI/CD externo;
* ejecución arbitraria de comandos proporcionados como evidencia por el agente.

### Supersedes

Reemplaza el alcance de `add-task-completion-validation`: la validación de subtareas se mantiene como una de las condiciones del Completion Gate, pero el núcleo del change pasa a ser verificación real ejecutada por WAM, no declaraciones del agente.
