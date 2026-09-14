# Change: wam-context-budget-admission

## Problema

El Context Pack tiene presupuesto, pero no existe una política uniforme
para decidir qué hacer cuando una dependencia obligatoria no cabe.

Actualmente una dependencia puede ser omitida por presupuesto.

Eso puede producir:

contexto seleccionado + dependencia causal ausente

sin distinguir entre contexto opcional y contexto necesario.

## Propuesta

Introducir clases de admisión:

- MANDATORY
- CONDITIONAL
- OPTIONAL

Solo OPTIONAL puede ser descartado silenciosamente por presupuesto.

Una dependencia MANDATORY debe producir:

- budget escalation;
- context reduction;
- o sufficiency failure explícito.

Nunca debe desaparecer silenciosamente.

## Principio

El presupuesto limita contexto opcional.
No puede invalidar una precondición necesaria.
