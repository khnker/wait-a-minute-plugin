---
name: wait-a-minute
description: Capa de pre-flight cognitivo para OpenCode que analiza peticiones antes de ejecutar, detecta supuestos, clasifica tareas y selecciona skills pertinentes
license: MIT
compatibility: opencode
triggers:
  - any user prompt entering OpenCode
  - antes de resolución de skills y ejecución de agente
metadata:
  version: 1.0.0
  prompt_hook: true
---

# Wait a Minute — Pre-Flight Cognitive Layer

## Philosophy

«Wait a Minute: antes de responder, no asumas. Entiende primero.»

El sistema debe analizar la petición del usuario, inspeccionar el proyecto cuando corresponda, identificar qué sabe y qué no sabe, detectar supuestos, determinar el tipo de tarea, descubrir las skills relevantes y decidir si necesita hacer preguntas antes de continuar.

**El trabajo real comienza después del pre-flight.**

## Prompt Hook Behavior

El hook de sesión `prompt` intercepta el prompt **antes** de:
1. Resolución de skills
2. Selección de modelo/tier
3. Invocación de agente
4. Procesamiento del request

El hook puede:
- Modificar el prompt
- Ejecutar análisis de pre-flight
- Decidir si continuar, preguntar o delegar
- Inyectar contexto al agente

## Four Categories Framework

### KNOWN
Hechos confirmados por:
- Usuario (declaración explícita)
- Archivos (código, configuración)
- Herramientas (results de grep/read/glob)
- Configuración del proyecto
- Documentación del proyecto
- OpenSpec specs/changes cuando existan

### INFERRED
Conclusiones razonables derivadas de evidencia:
- Patrones observados en el código
- Convenciones del proyecto
- Dependencias inferidas
- Estructura de directorios

### ASSUMED
Supuestos que podrían ser incorrectos:
- "Usa JWT porque es el estándar"
- "El frontend es Angular porque así suele ser"
- "Redis es para caching porque sí"

### UNKNOWN
Información que todavía no conocemos:
- Si el proyecto ya usa autenticación
- Quién toma decisiones de arquitectura
- Qué restricciones ocultas existen

**Regla:** «Si un UNKNOWN o ASSUMED puede cambiar materialmente la solución, no continuar silenciosamente: hacer una pregunta.»

## Project-Aware Analysis

Antes de formular preguntas, el sistema debe analizar el repositorio cuando sea posible. Priorizar (en orden):

1. `AGENTS.md` — contexto persistente del proyecto
2. `README` — descripción y setup
3. `package.json` / equivalente — dependencias y scripts
4. Estructura de directorios relevante
5. Archivos relacionados con la petición
6. Tests existentes — patrón de implementation
7. Configuración de build/lint
8. Dependencias relevantes
9. Documentación técnica existente
10. OpenSpec specs/changes cuando existan
11. Skills del proyecto

**El análisis debe ser proporcional a la tarea.**
- Modificación trivial → inspección ligera
- Decisión arquitectónica → análisis profundo

## Request Classification

Determinar una o más categorías:

- `question` — pregunta directa, factual
- `research` — investigar un tema, comparar opciones
- `debugging` — encontrar y corregir un bug
- `bug-fix` — corregir un error conocido
- `implementation` — nuevo código o funcionalidad
- `refactoring` — mejorar estructura existente
- `architecture` — decisiones de alto nivel
- `security` — vulnerabilidades o hardening
- `performance` — optimización de rendimiento
- `testing` — tests unitarios/integración
- `migration` — migrar a otra tecnología
- `infrastructure` — setup, despliegue, configuración
- `documentation` — docs, README, comentarios
- `investigation` — investigación de código existente
- `planning` — planear un cambio
- `destructive-operation` — cambios que pueden destruir datos/estado

**También determinar:**
- `complexity`: trivial | normal | complex
- `risk`: bajo | medio | alto
- `ambiguity`: baja | media | alta
- `confidence`: 0-100%

## Assumption Audit

Antes de continuar debe realizar una auditoría explícita:

```
What do I know?
What am I inferring?
What am I assuming?
What do I still need to know?
```

**No debe preguntar cosas que pueda determinar inspeccionando el proyecto.**

**Ejemplo incorrecto:**
> "¿Qué framework usas?"
> (si package.json ya permite determinarlo)

**Ejemplo correcto:**
> "Detecté Angular 19 + NestJS. No encuentro evidencia de si la autenticación actual debe reemplazarse o extenderse. ¿Cuál de las dos?"

## Modes

### FAST
Para tareas triviales y no ambiguas.
- No ejecutar entrevista.
- Ejemplos: explicar una función, cambiar un nombre, responder una pregunta factual simple.
- **Comportamiento:** comprender → seleccionar skill → proceder

### NORMAL (por defecto)
- Análisis ligero
- Inspección contextual
- Assumption audit
- Preguntas solamente si son necesarias
- Selección de skills

### STRICT
Para:
- Arquitectura
- Migraciones
- Seguridad
- Infraestructura
- Operaciones destructivas
- Cambios de producción
- Cambios con alto impacto

**Debe realizar un análisis más profundo antes de continuar.**
- El modo debe poder ser configurable por proyecto o request.

## Skill Discovery

Wait a Minute debe aprovechar el sistema nativo de skills de OpenCode. No debe cargar indiscriminadamente todas las skills.

**Proceso:**
1. Observar las skills disponibles (`.opencode/skills`, `~/.config/opencode/skills`, `.claude/skills`, `~/.claude/skills`, `.agents/skills`, `~/.agents/skills`)
2. Comparar sus descripciones con la tarea
3. Seleccionar las potencialmente relevantes
4. Cargar el contenido completo solamente de las skills candidatas
5. Eliminar skills redundantes
6. Recomendar el conjunto mínimo necesario

**Skills compatibles:**
- `.opencode/skills`
- `~/.config/opencode/skills`
- `.claude/skills`
- `~/.claude/skills`
- `.agents/skills`
- `~/.agents/skills`

Y cualquier otra ubicación soportada oficialmente por OpenCode.

## Skill Selection

No seleccionar skills simplemente porque contienen palabras coincidentes. Evaluar:

- **relevancia:** qué tan directamente la skill aborda la tarea
- **especificidad:** la skill es específica o genérica
- **autoridad:** reputación de la skill en el ecosistema
- **compatibilidad:** la skill funciona con la versión de OpenCode del proyecto
- **cobertura:** la skill cubre el needed functionality
- **redundancia:** hay skills que hacen lo mismo
- **coste de contexto:** la skill añade mucho peso de contexto

**Preferir** «minimum sufficient skill set» **sobre** «maximum available skill set».

**Ejemplo:**
> Task: "Revisar la seguridad del nuevo endpoint OAuth"
>
> Candidates: backend, architecture, security-review, oauth, testing, frontend
>
> **Selected:** oauth, security-review, backend
>
> **Rejected:** frontend — irrelevant; testing — secondary; architecture — unnecessary for this review

## Project-Aware Skill Selection

La selección debe depender tanto de la tarea como del proyecto.

**Ejemplo:**
> Task: "Agregar cache"
> Project: NestJS + Redis already present
>
> **Skills:** redis, nestjs, caching
>
> **Selection:** redis + nestjs + caching
>
> Architecture skill only if the change crosses architectural boundaries.

## Pre-Flight Output

Wait a Minute debe mantener internamente una estructura equivalente a:

```json
{
  "intent": { "classification": "...", "confidence": ... },
  "project": {
    "detected_stack": [...],
    "architecture": "...",
    "relevant_files": [...]
  },
  "known": [...],
  "inferred": [...],
  "assumed": [...],
  "unknown": [...],
  "questions": [...],
  "skills": {
    "candidates": [...],
    "selected": [...],
    "rejected": [...]
  },
  "risk": "...",
  "complexity": "...",
  "ambiguity": "...",
  "strategy": "...",
  "ready": true/false
}
```

**Por defecto, mostrar solamente un resumen compacto cuando sea útil.**

**Ejemplo:**
```
Wait a minute.

Entendí que quieres reemplazar la autenticación actual por Google OAuth.

Revisé:
- NestJS auth module
- Angular auth service
- existing JWT implementation
- current dependencies

Falta una decisión que cambia la implementación:
¿quieres mantener JWT como sesión interna o pasar a sesiones gestionadas por OAuth?

Skills relevantes:
- oauth
- security-review
- nestjs

Espero esa decisión antes de implementar.
```

## Handoff

Cuando el contexto sea suficiente:

```
WAIT A MINUTE
✓ intent understood
✓ project analyzed
✓ assumptions resolved
✓ skills selected
✓ strategy defined

Proceed.
```

Entonces el agente principal debe recibir el contexto relevante. **No ejecutar nuevamente el análisis desde cero.**

## Persistence

- No crear archivos permanentes para cada interacción
- El estado de Wait a Minute debe ser temporal por sesión/prompt salvo que exista una razón clara para persistirlo
- No modificar AGENTS.md automáticamente
- No modificar código
- No instalar skills automáticamente
- No cambiar configuración del proyecto automáticamente

## OpenSpec Integration

Si la tarea requiere planificación o un cambio no trivial, Wait a Minute debe reconocer la existencia de OpenSpec y sus artefactos:

- `"openspec/project.md"`
- `"openspec/specs"`
- `"openspec/changes"`

Cuando exista una especificación relevante, debe utilizarla como fuente de contexto. No debe reemplazar OpenSpec. Debe actuar como una capa anterior:

```
User request
    ↓
Wait a Minute
    ↓
Understand / inspect / clarify
    ↓
OpenSpec explore/propose cuando sea apropiado
    ↓
Implementation
```

Si el usuario está expresando una idea todavía ambigua, debe recomendar exploration/specification antes de implementación.

## No-Goals

NO construir:
- Un segundo sistema de skills
- Un chatbot de entrevista permanente
- Un agente que implemente durante el análisis
- Un crawler que lea todo el repositorio
- Un sistema que pregunte siempre
- Un registry propietario de skills
- Un reemplazo de OpenSpec
- Un reemplazo del sistema de agentes de OpenCode
- Una solución dependiente exclusivamente de Claude

**Debe funcionar con los modelos y agentes soportados por OpenCode.**

## Requirements

Investiga primero las APIs actuales de OpenCode antes de implementar. Verifica específicamente:

- Plugin lifecycle
- "prompt" hook
- Session context
- Skill discovery/resolution
- Custom tools
- MCP integration
- Agent invocation
- Permission model
- Cómo modificar/interceptar un prompt
- Cómo evitar loops de reentrada
- Cómo manejar errores
- Cómo preservar el prompt original

La solución debe ser compatible con la versión actual de OpenCode y no depender de APIs obsoletas.

## Security

Wait a Minute debe ser read-only durante el pre-flight por defecto.
- No ejecutar comandos destructivos
- No modificar archivos
- No instalar dependencias
- No realizar cambios en infraestructura
- Las herramientas utilizadas durante el análisis deben respetar los permisos de OpenCode
- Si una operación requiere permisos adicionales, detenerse y solicitar autorización

## Observability

Agregar logging/debugging opcional para poder entender:
- Por qué se activó Wait a Minute
- Qué archivos inspeccionó
- Qué skills consideró
- Por qué seleccionó/rechazó skills
- Qué preguntas generó
- Qué supuestos detectó
- Por qué decidió continuar

El logging debe poder desactivarse y no debe incluir secretos ni contenido sensible innecesario.

## Tests

Crear tests para como mínimo:

1. Petición trivial → bypass
2. Petición ambigua → pregunta
3. Información disponible en repo → no preguntar
4. Arquitectura → análisis profundo
5. Skill irrelevante → rechazo
6. Skill altamente relevante → selección
7. Múltiples skills redundantes → reducción
8. Proyecto sin contexto → preguntas al usuario
9. Proyecto con AGENTS.md → utilización
10. OpenSpec existente → integración
11. Error de una herramienta → graceful degradation
12. Loop/reentrancy prevention
13. Prompt original preservado
14. Modo FAST/NORMAL/STRICT
15. Operación potencialmente destructiva → STRICT