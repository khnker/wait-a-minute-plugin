# Change: web-design-context-system

## Why

WAM actualmente trata las tareas de UI/Frontend con el mismo `Context Engine` que cualquier otra tarea: N1 (project) y N3 (session) no tienen **conocimiento específico de diseño**. El resultado es que el agente recibe tokens genéricos de proyecto + cápsulas irrelevantes + memoria de sesión, pero **ningún marco de razonamiento profesional de diseño** (jerarquía, composición, tokens semánticos, accesibilidad, anti-slop, revisión visual).

Esto produce tres problemas medibles:

1. **Implementaciones con gradientes/glass/cards/gradients decorativos** sin justificación de producto (slop AI).
2. **Valores arbitrarios** (`#3B82F6`, `12px`, `rounded-2xl`) en lugar de tokens semánticos del proyecto (`color.action.primary`, `space.component.default`, `radius.control`).
3. **Falta de consistencia cross-session** — sesión A establece spacing/tipografía, sesión B crea una página nueva ignorando esas reglas porque no hay persistencia estructurada de decisiones de diseño.

El spec del usuario describe una solución: un **Design Context System** modular, alimentado por WAM, con `DESIGN.md` persistente + selección de referencias por tipo de tarea + tokens semánticos + revisión visual. Esta es la pieza que faltaba para que WAM genere UI con la misma calidad de razonamiento que ya aplica a código backend.

## What Changes

- **NEW skill `web-design/`** con `SKILL.md` pequeño (solo routing) + 13 references modulares + template `DESIGN.md`.
- **NEW Context Engine domain: `design`** — hermano de `repository`, `domain`, `session` en el motor N1+N3.
- **NEW persistent artifact `DESIGN.md`** por proyecto, con tokens semánticos + principios + anti-patterns.
- **NEW task classifier** que detecta 13 tipos de trabajo UI (new product, page, flow, component, redesign, accessibility, etc.) y rutea referencias mínimas suficientes.
- **NEW semantic tokens** (`color.text.primary`, `space.component.default`, `radius.control`) como contrato entre DESIGN.md y componentes.
- **NEW design decision sheet** ligero para tareas de diseño sustantivas (proporcional al scope, no para cambios triviales).
- **NEW visual review gates** no-compensatorios (jerarquía, composición, accesibilidad, token adherence) — un fallo crítico no se compensa con decoración.
- **NEW anti-slop negative-rules reference** — patrones frecuentes de AI slop tratados como señales de revisión, no bans incondicionales.
- **NEW design drift detection** — diff entre `DESIGN.md` ↔ tokens ↔ implementación.

**No copiamos literalmente** ningún repositorio externo. Los 12 repos listados en el spec son **fuentes de investigación**; los conceptos pasan por Source Synthesis (audit + classification + matrix) antes de entrar a WAM.

## Capabilities

### New Capabilities

- `design-context`: motor de contexto de diseño (task classifier + reference router + DESIGN.md discovery + token resolver + visual review + drift detection).
- `design-persistence`: formato y ciclo de vida de `DESIGN.md` (identidad, principios, tokens semánticos, motion, anti-patterns, deviations conocidas).
- `design-task-classifier`: clasificación de trabajo UI en 13 categorías con routing de references mínimo suficiente.

### Modified Capabilities

- `context-assembly-layer`: añadir el dominio `design` como cuarto eje del Context Engine (junto a repository/domain/session). El selector N1+N3 ahora considera design-context cuando la tarea es UI. Esto cambia el **comportamiento a nivel de requirement**, no solo implementación.

## Impact

- **Code affected:**
  - `index.js` — añadir clasificación de tareas UI en el pre-flight (heurística o router).
  - `assembly.js` — extender `assembleContext()` con eje `design` (similar a N3 session).
  - `context.js` — añadir funciones `discoverDesignContext(root)`, `loadDesignTokens(root)`, `classifyDesignTask(prompt)`.
  - `skills/web-design/` — nueva carpeta con SKILL.md + 13 references + template.
  - `wamCli` — sub-comandos `design show|set|drift`.
- **Tests affected:** añadir ~15 tests nuevos (T1–T15 del spec). Tests existentes NO deben romperse (regression contract).
- **Dependencies:** ninguno nuevo. Todo built-in Node + filesystem.
- **Out of scope:**
  - Browser verification real (Playwright ya disponible, pero la integración completa es fase 2).
  - Embeddings para retrieval semántico (fase 2 si el selector lexical no alcanza).
  - Multi-tenant design system registry (un DESIGN.md por proyecto, no global).
