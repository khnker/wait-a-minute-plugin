# Context Assembly Layer — Tasks

## Implementación
- [x] `assembly.js`: assembleContext (N0-N3, reglas por clasificación, prohibiciones, presupuesto por nivel)
- [x] Integración index.js: reemplazar inyecciones fragmentadas por Context Pack
- [x] Continuations: solo N2

## Verificación
- [x] `context-assembly.test.mjs`: selección estricta (A/B/unrelated/trivial/continuation/new-session) + budgets
- [x] `provenance_conflict`, `context_budget`, `no_task_assumption`, `task_isolation` live (suite 74/74)
- [x] README: sección four-level context loading
