# Clarification Gate

## Why

The cognitive model already states the rule: "si un UNKNOWN o ASSUMED puede cambiar materialmente la solución, no continuar silenciosamente: hacer una pregunta". But today that rule depends on the agent choosing to obey the injected prompt — that is prompt guidance, not enforcement. A material uncertainty can still become an implementation decision if the agent ignores the suggestion.

This change converts the rule into a runtime enforcement mechanism equivalent to the Completion Gate, but for questions.

## What Changes

Enforces the invariant:

```
decision-critical UNKNOWN / ASSUMED
        ↓
     ASKING
        ↓
  implementation blocked (tool.execute.before)
        ↓
    user answers (natural language or /wam answer)
        ↓
   re-run pre-flight
        ↓
 uncertainty resolved? → PROPOSED → normal flow
        ↓ NO
     ASKING (new/repeated question)
```

- `ASKING` exists as an explicit runtime state; mutating tools are blocked while it is active (`tool.execute.before`); read-only investigation tools remain allowed.
- A message received in `ASKING` is classified: natural-language answer (resolves the pending question, re-evaluates, emits `✓ question answered / ready → proceed`), implementation attempt (intercepted and rewritten into the blocking directive, never consumed as an answer), or changed task (new intent → new task; the old task stays persisted and uncontaminated).
- Continuation Fast-Path never bypasses `ASKING` (approved task + pending question → gate wins).
- Blocking questions persist in task state with stable ids, status (`pending|answered|resolved`), reason, and options when the decision is enumerable (e.g. hard/soft/anonymize).
- Answering never silently preserves `APPROVED`: changed decisions re-propose the contract (`PROPOSED`) for approval; completion still requires `VERIFYING` + evidence.
- `/wam` inspection commands remain usable while `ASKING` (no gate trap on the CLI).

## Non-Goals

- No new skill system, no permanent chatbot, no replacing OpenSpec, no replacing the Completion Gate.
- No questions for information obtainable by repository inspection (investigate first).
- No blocking on non-material unknowns; no questions on trivial tasks.
- No repository crawler; no automatic AGENTS.md modification; no implementation during pre-flight.
