# Design: add-verifiable-task-completion

## 1. Verification Contract

Cada requirement puede declarar uno o más checks de verificación.

Conceptualmente:

```yaml
requirements:
  - id: R1
    title: DELETE endpoint implemented
    verification:
      checks:
        - id: R1-C1
          type: command
          command: npm test -- users/delete.spec.ts
```

Un requirement puede tener:

```text
0 checks
1 check
N checks
```

### Regla

Si un requirement no tiene checks definidos, no puede convertirse automáticamente en `VERIFIED` mediante texto libre.

Podrá quedar:

```text
IMPLEMENTED
```

o:

```text
VERIFYING
```

según el estado de la tarea.

## 2. Verification Check

Crear una representación normalizada:

```text
VerificationCheck
```

con:

```yaml
id
requirement_id
type
command
cwd
timeout_ms
```

En WAM 1.1 el único tipo ejecutable obligatorio será:

```text
command
```

No se implementarán todavía tipos como:

```text
http
file
assertion
manual
```

aunque el modelo debe permitir extenderlos posteriormente.

## 3. Verification Engine

Crear un módulo independiente:

```text
verification.js
```

Responsabilidades:

```text
executeCheck()
normalizeResult()
createEvidence()
verifyRequirement()
```

El engine no debe conocer detalles del CLI ni del lifecycle de OpenCode.

Flujo:

```text
VerificationCheck
       ↓
execute
       ↓
capture result
       ↓
create Evidence
       ↓
evaluate
       ↓
VerificationResult
```

## 4. Evidence

La evidencia machine-verifiable tendrá como mínimo:

```yaml
id:
requirement_id:
check_id:
type: command
command:
cwd:
exit_code:
started_at:
completed_at:
output_hash:
repository_state:
```

`stdout` y `stderr` no deben almacenarse indefinidamente como parte de la memoria de WAM.

La evidencia puede conservar una representación limitada del output para diagnóstico, pero el modelo persistente debe utilizar principalmente:

```text
output_hash
exit_code
timestamps
repository state
```

Esto evita convertir `.wam` en un almacén de logs.

## 5. Repository State

La evidencia debe identificar el estado del repositorio en el momento de la verificación.

Debe capturarse como mínimo:

```yaml
repository_state:
  root:
  head:
  working_tree_dirty:
```

Cuando sea posible, debe existir además una representación estable del working tree.

La razón es evitar:

```text
verify
   ↓
code changes
   ↓
DONE
```

utilizando evidencia producida sobre un estado anterior.

### Regla

Si un requirement cambia después de haber sido verificado, su estado debe volver a:

```text
VERIFYING
```

y la evidencia anterior deja de ser suficiente para `DONE`.

## 6. Requirement State

Los requirements deben distinguir implementación de verificación.

Estados:

```text
PENDING
IMPLEMENTING
IMPLEMENTED
VERIFYING
VERIFIED
```

`BLOCKED` puede existir como estado de tarea, pero no es obligatorio como estado de requirement en esta versión.

Semántica:

### PENDING

No iniciado.

### IMPLEMENTING

El agente está trabajando en el requirement.

### IMPLEMENTED

El agente declara que la implementación está realizada.

Esto sigue siendo una claim.

### VERIFYING

Existe una verificación pendiente, ejecutándose o fallida.

### VERIFIED

WAM posee evidencia válida de que todos los checks requeridos para el requirement pasaron.

`VERIFIED` no puede establecerse únicamente mediante texto libre.

## 7. Completion Gate

El Completion Gate debe evaluar simultáneamente:

```text
contract exists
AND
contract approved
AND
all requirements implemented
AND
all requirements verified
AND
all required checks passed
AND
verification evidence is valid
AND
no invalidated evidence exists
```

Por tanto:

```text
DONE
```

solo puede ocurrir cuando:

```text
every requirement == VERIFIED
```

y cada `VERIFIED` está respaldado por evidencia válida.

## 8. Verification Flow

El flujo normal será:

```text
PROPOSED
    ↓
IMPLEMENTING
    ↓
IMPLEMENTED
    ↓
VERIFYING
    ↓
execute checks
    ↓
┌───────────────┐
│ all pass?     │
└───────┬───────┘
        │
   ┌────┴────┐
   │         │
  YES        NO
   │         │
   ▼         ▼
VERIFIED   VERIFYING
   │
   ▼
Completion Gate
   │
   ▼
  DONE
```

## 9. Multiple Checks

Si un requirement tiene:

```text
R1-C1
R1-C2
R1-C3
```

todos los checks obligatorios deben pasar.

```text
R1-C1 = PASS
R1-C2 = PASS
R1-C3 = FAIL

R1 = VERIFYING
```

No existe verificación parcial.

## 10. Failure Handling

Un check puede terminar en:

```text
PASS
FAIL
TIMEOUT
ERROR
```

Todos excepto `PASS` mantienen el requirement en:

```text
VERIFYING
```

El resultado debe conservar suficiente información para que el agente pueda continuar el diagnóstico.

Ejemplo:

```text
R1 verification failed

check: R1-C2
command: npm test -- users/delete.spec.ts
exit_code: 1

R1 remains VERIFYING.
```

## 11. Timeout

Cada check debe tener un timeout.

Debe existir un default configurable.

El Verification Engine no debe permitir que un check bloquee indefinidamente el proceso del agente.

Resultado:

```text
TIMEOUT
```

se considera failure.

## 12. Output Limits

La ejecución debe limitar:

```text
stdout
stderr
```

para evitar que un comando genere cantidades arbitrarias de contexto.

El objetivo de WAM es precisamente controlar costo y contexto.

La evidencia persistente debe preferir:

```text
exit_code
output_hash
truncated diagnostic
```

sobre output completo.

## 13. Security Boundary

WAM no debe ejecutar comandos provenientes directamente del campo:

```text
evidence
```

del agente.

Incorrecto:

```text
agent:
  evidence = "npm test && rm -rf ..."
```

WAM no debe convertir esto en una instrucción ejecutable.

Los comandos ejecutables deben provenir del:

```text
approved Completion Contract
```

El agente puede proponer checks durante la construcción del contract, pero una vez aprobado el contract, WAM ejecuta únicamente esos checks.

## 14. Manual Evidence

WAM debe continuar permitiendo registrar evidencia textual para información no automatizable.

Sin embargo:

```text
manual evidence
```

no equivale automáticamente a:

```text
VERIFIED
```

Ejemplo:

```text
/wam progress R1 done "Reviewed manually"
```

puede registrar información útil.

Pero:

```text
/wam progress R1 verified "Reviewed manually"
```

no debe saltarse un check machine-verifiable requerido.

## 15. Existing Completion Validation

La validación existente de subtasks/dependencies debe mantenerse.

Por tanto:

```text
parent DONE
```

requiere:

```text
all child tasks complete
+
all requirements verified
+
valid verification evidence
```

El nuevo Verification Engine amplía el Completion Gate; no elimina la validación existente.

## 16. CLI

El sistema puede mantener:

```text
/wam progress <requirement> implemented <evidence>
```

pero:

```text
/wam progress <requirement> verified <evidence>
```

no debe permitir falsificar una verificación machine-verifiable.

La operación correcta para checks automáticos será conceptualmente:

```text
/wam verify <requirement>
```

que:

1. carga los checks aprobados;
2. ejecuta los checks;
3. genera Evidence;
4. actualiza el requirement;
5. informa el resultado.

No se requiere inicialmente exponer un comando separado para ejecutar un check individual.

## 17. Persistence

La evidencia debe persistirse dentro del estado `.wam` asociado a la tarea.

Ejemplo conceptual:

```text
.wam/
  tasks/
    <task-id>/
      task.json
      requirements.json
      verification.json
```

La implementación puede reutilizar la estructura persistente existente si permite mantener la separación lógica.

No crear una segunda memoria paralela.

## 18. Invalidating Evidence

Cuando el estado del repositorio cambia de manera relevante después de una verificación, la evidencia debe considerarse potencialmente obsoleta.

Como mínimo:

```text
new implementation action
+
affected requirement
```

debe invalidar su verification status.

La invalidación debe ser conservadora.

No se requiere todavía análisis semántico del diff.

## 19. Architecture

La responsabilidad debe quedar separada:

```text
index.js
    ↓
orchestration / OpenCode adapter

engine.js
    ↓
reasoning / gates

verification.js
    ↓
command execution + evidence

memory.js
    ↓
persistent task state

context.js
    ↓
context retrieval

assembly.js
    ↓
context packing
```

No agregar nuevas reglas de negocio de Verification Engine dentro de `index.js`.

## 20. Non-goals

WAM 1.1 no intentará:

* determinar mediante LLM si un test es suficiente;
* analizar semánticamente todos los diffs;
* reemplazar CI;
* ejecutar comandos arbitrarios;
* almacenar logs completos;
* implementar embeddings;
* implementar vector search;
* modificar el sistema N0–N3;
* implementar skill outcome telemetry;
* implementar review automático.
