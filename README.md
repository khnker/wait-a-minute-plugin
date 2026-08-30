# Wait a Minute — OpenCode Pre-Flight Cognitive Layer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub repo](https://img.shields.io/badge/GitHub-khnker/wait-a-minute-plugin-blue.svg)](https://github.com/khnker/wait-a-minute-plugin)

## Descripción

**Wait a Minute** es una capa de pre-flight cognitivo para OpenCode que analiza las peticiones del usuario **antes** de que el agente comience su procesamiento. Su objetivo es reducir decisiones incorrectas causadas por asumir contexto no verificado.

El sistema se ejecuta en el hook de sesión `prompt` de OpenCode, interceptando el request antes de la resolución de skills y la invocación del agente.

## Características

- **Análisis previo al agente**: Intercepta prompts vía hook `chat.message` antes de skill resolution
- **4 categorías de contexto**: KNOWN, INFERRED, ASSUMED, UNKNOWN — rastreo explícito de qué se sabe, qué se deduce, qué se asume y qué falta por conocer
- **3 modos de operación**:
  - `FAST`: Tareas triviales — bypass, proceder directamente
  - `NORMAL` (por defecto): Análisis ligero, preguntas solo si son necesarias
  - `STRICT`: Arquitectura, seguridad, migraciones, alto riesgo — análisis profundo requerido
- **Discovery nativo de skills**: Aprovecha el sistema de skills de OpenCode (`~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills`, etc.) sin registry paralelo
- **Integración OpenSpec**: Reconocce `openspec/project.md`, `openspec/specs`, `openspec/changes` como fuente de contexto
- **Auditoría de suposiciones**: Detecta y hace explícitas suposiciones que podrían cambiar la solución
- **Handoff estructurado**: Resultados almacenados en sesión para el agente principal, evitando re-análisis
- **15 escenarios de prueba cubiertos**: Bypass trivial, preguntas para ambigüedad, info en repo→no question, arquitectura→deep, selección/rechazo de skills, redundantes→reducción, sin contexto→preguntas, AGENTS.md→uso, OpenSpec→integración, errores de herramienta, prevention de loops, preservación de prompt, modos FAST/NORMAL/STRICT, operaciones destructivas→STRICT

## Instalación

El plugin está registrado en la configuración de OpenCode:

```json
// /home/nicolas/.config/opencode/opencode.jsonc
"plugin": [
    "@tarquinen/opencode-dcp@latest",
    "opencode-vibeguard",
    "opencode-pty",
    "wait-a-minute",
    [...],
    "opencode-model-router"
]
```

## Cómo funciona

1. **Usuario envía prompt** a OpenCode
2. **Hook `chat.message`** se ejecuta antes de skill resolution
3. **Wait a Minute analiza**:
   - Clasificación de la petición (trivial/normal/architectural)
   - Inspección del proyecto (AGENTS.md, package.json, OpenSpec specs, stack tecnológico)
   - Auditoría de suposiciones (KNOWN/INFERRED/ASSUMED/UNKNOWN)
   - Discovery y selección de skills pertinentes
   - Determinación de modo (FAST/NORMAL/STRICT)
4. **Resultados almacenados** en sesión (`sessionStore.set("waitAnalysis", analysis)`)
5. **Agente principal recibe** contexto y decide cómo proceder
6. **Si `ready: true`**: Proceed with implementation
7. **Si `ready: false`**: Presentar summary y preguntas al usuario

## Output de ejemplo

```
Wait a minute.

Intención: implementation (confianza: 75%)
Stack: typescript
Conocido(s): AGENTS.md presente en el proyecto; package.json detectado; Dependencias: typescript, @nestjs/core
Inferido(s): NestJS framework detectado
Asumido(s): El usuario asume que se necesita agregar nueva funcionalidad
Desconocido(s): Contexto del proyecto limitado - inspección recomendada

Skills candidatas: oauth (rel 80), security-review (rel 70), nestjs (rel 60)
Skills seleccionadas: oauth, security-review, nestjs
Skills rechazadas: frontend, testing, architecture

Riesgo: medium
Complejidad: medium
Ambigüedad: medium
Estrategia: NORMAL

¿Listo para proceder?: NO

Consejo: Falta una decisión que cambia la implementación: ¿quieres mantener JWT como sesión interna o pasar a sesiones gestionadas por OAuth?
```

## Casos de uso

### Petición trivial → Bypass
> "Renombra la variable X a Y"
- Wait a Minute: `FAST mode, trivial`
- Agente: Proceder directamente con el rename

### Petición ambigua → Preguntas
> "Agrega Redis para mejorar el rendimiento"
- Wait a Minute: Inspecciona proyecto, detecta que Redis no está configurado, pregunta sobre decisión crítica
- Agente: Esperar respuesta del usuario antes de implementar

### Arquitectura → Modo STRICT
> "Migra PostgreSQL a proveedor cloud"
- Wait a Minute: `STRICT mode, high risk`
- Agente: Análisis profundo antes de cualquier cambio

### Contexto disponible → No preguntar
> "¿Qué framework usa el proyecto?"
- Wait a Minute: Detecta `package.json` con `nestjs`/`angular`/`express`, responde basándose en el repo
- Agente: Continuar sin preguntas

## Arquitectura

El plugin consta de 3 componentes:

1. **`index.js`**: Plugin factory registrada en OpenCode, hook `chat.message`, API pública (`analyze`, `generateSummary`, `isTrivial`, `requiresStrict`)
2. **`engine.js`**: Motor de análisis core - clasificación, inspección de proyecto, auditoría de suposiciones, discovery de skills, determinación de modo
3. **`SKILL.md`**: Filosofía, framework de 4 categorías, definiciones de modos, heurísticas de skill discovery

## Desarrollo

### Estructura del repo

```
/home/nicolas/dev/wait-a-minute-plugin/
├── README.md          ← Este archivo
├── SKILL.md           Filosofía y framework
├── engine.js          Motor de análisis
├── index.js           Plugin factory + API pública
└── package.json       Metadatos
```

### Para contribuir

1. Fork el repositorio
2. Crear rama: `git checkout -b feature/nueva-caracteristica`
3. Commit: `git commit -m "Add nueva característica"`
4. Push: `git push origin main`
5. Pull Request

## Licencia

MIT © khnker

## Referencias

- OpenCode Documentation: https://opencode.ai
- OpenSpec: https://openspec.io
- Skill Discovery: Usa habilidades nativas en `.opencode/skills`, `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills`