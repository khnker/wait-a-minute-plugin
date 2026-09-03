# Human-Centered Change Quality Specification

## Principios de diseño
- Calidad cognitiva: El cambio debe ser comprensible.
- Autonomía humana: El sistema asiste, pero el humano valida el valor.
- Feedback temprano: Calidad definida antes de la ejecución.

## ADDED Requirements con Escenarios
- Requerimiento: Todo cambio debe pasar el filtro de impacto humano.
- Escenario A: Refactorización crítica donde el humano debe revisar la pérdida de contexto.
- Escenario B: Cambio de política de bajo impacto donde el sistema propone la aprobación.

## Diseño de integración con Completion Gate
- El Completion Gate se extiende para verificar la checklist de "Calidad Centrada en lo Humano" antes de marcar el Change como archivado.
