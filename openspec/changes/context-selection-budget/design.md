# Context Selection and Budget — Design

## Goal

Construir un Context Package específico de la tarea bajo presupuesto de
tokens: ni todo el contexto, ni solo L1.

## Selector (determinístico)

```
selectContext(task, { budget, sessionId }) →
  L1 activas (base)
  + L2/L3 activas con utility = relevance × importance × freshness × confidence / token_cost
  + dependencias resueltas (recursivo, dedupe por ya-incluida)
  + redundancia eliminada (superseded_by / mismo scope normalizado)
  + corte por budget (mayor utility primero)
```

- relevance: overlap de tokens entre la tarea y (purpose+scope+hints+content)
- freshness: decay por updated_at (1 - días/30, floor 0.1)
- sufficiency: keywords críticas de la tarea (tests/migra/auth/...) sin match → insuficiente

## On-demand

`retrieveContext(query, limit)`: match de tokens sobre cápsulas activas
(L1-L3 + candidate). "No hay contexto" ≠ "no existe" (insufficiency disclosure).

## Observabilidad

Cada paquete se registra en `.wam/context/selection-log.jsonl`:
{ timestamp, task, selected_ids, rationale, budget_used, budget }.
