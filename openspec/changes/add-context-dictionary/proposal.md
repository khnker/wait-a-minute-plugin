# Add Context Dictionary

## Why

WAM actualmente debe descubrir repetidamente qué partes del repositorio corresponden conceptos mencionados por el usuario.

Por ejemplo, una solicitud como:

«"modifica el buscador"»

Puede requerir explorar el repositorio para determinar que "buscador" corresponde a "SearchBar", "search.service.ts", una ruta concreta o un conjunto de archivos relacionados.

Esta resolución repetitiva consume tiempo y tokens y puede provocar que el agente cargue contexto innecesario.

WAM necesita una capa de resolución rápida que mantenga un mapa entre conceptos utilizados por humanos y elementos reales del repositorio.

El diccionario debe mantenerse sincronizado automáticamente con el repositorio y nunca convertirse en una fuente de verdad obsoleta.

## What Changes

### Context Dictionary

Agregar un índice persistente que permita resolver términos y conceptos hacia:

- archivos;
- directorios;
- símbolos;
- módulos;
- rutas;
- relaciones de dependencia.

El índice debe almacenar aliases y asociaciones semánticas, por ejemplo:

"buscador → SearchBar.tsx"

"usuarios → users module"

"autenticación → auth module"

La resolución debe devolver candidatos con evidencia y confianza, no asumir que una única asociación siempre es correcta.

### Incremental Indexing

El índice debe actualizarse incrementalmente cuando cambie el repositorio.

Debe detectar:

- archivos creados;
- archivos modificados;
- archivos eliminados;
- renames/moves;
- cambios de branch.

Los archivos modificados deben reindexarse sin reconstruir innecesariamente todo el índice.

### Staleness Detection

Cada elemento indexado debe tener suficiente información para determinar si sigue representando el estado actual del repositorio.

La implementación debe utilizar hashes de contenido y/o un mecanismo equivalente de validación determinista.

Una entrada inválida no debe utilizarse como contexto confiable.

### Semantic Association Lifecycle

Las asociaciones conceptuales deben distinguir entre:

- discovered;
- candidate;
- confirmed;
- invalid.

Una inferencia del LLM no debe convertirse automáticamente en una asociación confirmada.

Las asociaciones deben conservar evidencia que permita explicar por qué fueron creadas.

### Context Retrieval Integration

El Context Dictionary debe ejecutarse antes de la selección de contexto.

La resolución debe reducir el espacio de búsqueda disponible para el Context Selector, pero no decidir por sí sola qué contexto debe enviarse al modelo.

El resultado del diccionario debe alimentar los niveles de contexto existentes de WAM.

### Persistence

El índice debe persistir entre sesiones para evitar reconstruir información estructural y semántica ya conocida.

La persistencia debe ser específica al repositorio/proyecto y no mezclar asociaciones entre repositorios diferentes.

### Reconciliation

WAM debe disponer de un mecanismo de reconciliación completa capaz de reconstruir el índice cuando:

- cambia la versión del indexador;
- se detecta inconsistencia;
- el índice no existe;
- se solicita explícitamente un rebuild.

La reconciliación completa debe poder recuperar un índice consistente sin depender de asociaciones antiguas.

## Impact

### Benefits

- Reduce exploración repetitiva del repositorio.
- Reduce tokens utilizados para descubrir contexto.
- Mejora la precisión de la selección inicial.
- Permite reutilizar conocimiento entre sesiones.
- Permite que términos humanos se conviertan rápidamente en candidatos estructurales.

### Risks

El principal riesgo es que una asociación semántica incorrecta provoque selección de contexto incorrecta.

Para mitigarlo:

- las asociaciones deben tener confianza;
- deben conservar evidencia;
- las asociaciones ambiguas deben devolver múltiples candidatos;
- el Context Selector conserva la decisión final;
- entradas estructuralmente obsoletas deben invalidarse automáticamente.

### Compatibility

El cambio debe ser backward compatible con repositorios que todavía no tengan un índice.

En ese caso WAM debe construirlo bajo demanda y continuar funcionando aunque el diccionario esté vacío.
