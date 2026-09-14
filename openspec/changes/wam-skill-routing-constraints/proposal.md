# Change: wam-skill-routing-constraints

## Problema

Skill routing actualmente prioriza relevancia.

Relevancia no implica compatibilidad con el entorno o las restricciones
del Task.

## Propuesta

Añadir una etapa de compatibility filtering después del scoring.

Pipeline:

DISCOVER → SCORE → FILTER → SELECT → EXPLAIN

## Constraints

Un skill puede declarar:

- runtime requirements;
- tool requirements;
- platform requirements;
- conflicting capabilities;
- version requirements;
- prohibited environments.

## Objetivo

No seleccionar el skill más parecido.

Seleccionar el skill más apropiado entre los compatibles.
