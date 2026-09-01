# Wait a Minute

Cognitive governance layer for [OpenCode](https://opencode.ai/).

Wait a Minute (WAM) adds a pre-flight and completion-control layer to OpenCode. It makes the agent stop before acting on ambiguous work, establish what "done" means, track progress against explicit requirements, and provide evidence before completion is accepted.

WAM is designed around a simple principle:

> «Don't let the agent confuse activity with completion.»

## What WAM does

WAM operates around the OpenCode agent loop:

```
 User request
 │
 ▼
 ┌─────────────────┐
 │  WAM Pre-flight │
 └────────┬────────┘
          │
 Intent / scope / risk
          │
          ▼
 ┌─────────────────┐
 │   Completion    │
 │    Contract     │
 └────────┬────────┘
          │
   User approval
          │
          ▼
 ┌─────────────────┐
 │   Implementing  │
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │    Verifying    │
 └────────┬────────┘
          │
 Evidence required
          │
          ▼
 ┌──────────┐
 │   DONE   │
 └──────────┘
```

The important part is the completion gate: an agent cannot declare a task finished while WAM still has unresolved requirements.

## Core capabilities

### Cognitive pre-flight

Before execution, WAM analyzes the incoming task for:

- intent
- project context
- scope
- risk
- required capabilities
- verification strategy

It then routes relevant skills and establishes the initial task state.

### Completion Contracts

WAM turns a task into an explicit contract containing:

- requirements
- constraints
- verification steps
- completion state

The contract lifecycle is:

```
PROPOSED
 │
 ├── reject ──► REJECTED
 │
 └── approve
     │
     ▼
 IMPLEMENTING
     │
     ▼
 VERIFYING
     │
 All requirements
 Satisfied
     │
     ▼
   DONE
```

A contract remains "PROPOSED" until the user approves, edits, or rejects it.

### Completion Gate

WAM intercepts completion claims such as:

```
Done
Finished
Listo
Terminé
Completed
```

If requirements are still pending, WAM blocks the completion transition and redirects the agent toward the next unresolved requirement.

This is deliberately stronger than a prompt saying "remember to verify your work".

The agent's completion claim is enforced against persisted task state.

### Evidence-based progress

Requirements are tracked individually:

```
Requirements:
 - id: R1
   Title: API endpoint implemented
   Status: done
   Evidence: "npm test -- api.spec.ts"

 - id: R2
   Title: Validation added
   Status: pending
   Evidence: null
```

`nextAction` is derived from the first pending requirement.

WAM therefore tracks verified progress, not merely agent narration.

### Persistent engineering policies

WAM ships with transversal policies that apply across tasks:

- **Scope** — detect unnecessary surface expansion and scope creep.
- **Verify** — require evidence before completion.
- **Simplify / Ponytail** — prefer the smallest solution that satisfies the requirement; avoid unnecessary abstractions and refactors.

These policies are part of WAM's behavioral layer rather than individual task prompts.

### Skills

WAM also includes a self-contained skill registry containing approximately 2,097 skills.

The registry is bundled with WAM and contains the actual `SKILL.md` content, not merely metadata.

Skills are:

1. Selected through a single weighted router;
2. Loaded on demand;
3. Materialized locally when selected;
4. Available to OpenCode through the normal skill mechanism.

No network access or external repository lookup is required at runtime.

### Skill routing

The router scores candidates using:

```
Name × 5
Capability × 4
Keyword × 3
Description × 2
Domain × 1
```

WAM exposes the routing decision through:

```
/wam skills explain <prompt>
```

This makes skill selection inspectable instead of opaque.

### Fast path

WAM does not continuously interfere with an active task.

Once a Completion Contract is approved, ordinary continuation messages bypass the expensive pre-flight path.

For normal continuation:

```
User message
    │
    ▼
Approved task?
    │
   Yes
    │
    ▼
Continue OpenCode
```

WAM only re-enters the control path when it needs to handle:

- a new task;
- a completion claim;
- an explicit WAM operation.

This is important because governance should not become interaction latency.

### Context efficiency

WAM treats context as a constrained resource.

Injected instructions are compressed using WAM's "caveman" compression:

```
Understand task.
Check scope.
Verify evidence.
Do not declare DONE while requirements pending.
```

Instead of spending tokens on prose that does not change agent behavior.

The `/wam compress` command also generates a compact task summary and reports estimated context headroom.

```
Default budget: 32,000 tokens
```

The estimate uses a lightweight character-based approximation rather than a model tokenizer.

### Persistent task state

Task state is stored locally under:

```
.wam/
└── tasks/
    └── <task-id>/
        ├── state.yaml
        ├── summary.md
        └── caveman-summary.md
```

State includes:

- completion contract
- phase
- requirements
- evidence
- next action

Tasks can therefore be resumed without relying exclusively on the current conversation context.

## CLI

WAM exposes an `/wam` command namespace inside OpenCode.

**Skills**

```
/wam skills list
/wam skills search <query>
/wam skills inspect <id>
/wam skills explain <prompt>
```

**Contracts**

```
/wam contract approve
/wam contract reject
/wam contract edit <json>
```

**Progress**

```
/wam progress
/wam progress <id> done <evidence>
/wam progress <id> pending
```

**Tasks**

```
/wam task list
/wam task switch <id>
```

**Context**

```
/wam compress
/wam compress <taskId>
```

## Architecture

WAM is intentionally an OpenCode plugin, not a replacement runtime.

```
┌─────────────────────────────────────┐
│               OpenCode               │
│                                     │
│  Agent · Models · Tools · Runtime   │
│                                     │
│            │                        │
│            ▼                        │
│  ┌───────────────┐                  │
│  │      WAM       │                  │
│  │               │                  │
│  │ Pre-flight    │                  │
│  │ Contracts     │                  │
│  │ Policies      │                  │
│  │ Skill Router  │                  │
│  │ Progress      │                  │
│  │ Completion    │                  │
│  │ Gate          │                  │
│  └───────────────┘                  │
│                                     │
└─────────────────────────────────────┘
```

The plugin is implemented around three main responsibilities:

| File        | Responsibility                               |
|-------------|----------------------------------------------|
| `engine.js` | Analysis · Skill routing · Scoring · On-demand skill loading |
| `index.js`  | OpenCode plugin integration · Contract lifecycle · Completion gate · `/wam` CLI |
| `memory.js` | Persistent task state                        |

### Self-contained runtime

External skill repositories are **build-time sources only**.

They are used by the maintainer to:

- select skills;
- validate them;
- deduplicate them;
- pin their source revision;
- generate the bundled registry.

The generated registry is committed to WAM.

Users installing WAM do not need to clone, query, or trust those repositories at runtime.

Each bundled skill retains provenance:

```
Source.id
Source.repository
Source.path
Source.ref
```

Along with its actual `SKILL.md` content.

This makes the distributed skill catalog reproducible and auditable.

## What WAM is — and isn't

**WAM is**

- an OpenCode plugin;
- a cognitive pre-flight layer;
- a completion-control mechanism;
- an evidence-driven task tracker;
- a behavioral governance layer;
- a skill routing and loading system.

**WAM is not**

- a new LLM;
- an autonomous coding runtime;
- a replacement for OpenCode;
- a generic agent framework;
- a prompt collection pretending to be enforcement.

WAM deliberately delegates execution to OpenCode and focuses on controlling the conditions under which the agent proceeds and declares success.

## Why "Wait a Minute"?

Coding agents are good at producing plausible progress.

The dangerous failure mode is not necessarily:

> «"The agent did nothing."»

It is:

> «"The agent did something, reported success, and nobody verified whether the actual requirement was satisfied."»

WAM introduces a deliberate pause between "I think this is done" and "this is demonstrably done."

**Wait a Minute. Verify first.**

## Status

WAM is actively evolving around the following core:

- cognitive pre-flight;
- completion contracts;
- evidence-based completion;
- scope control;
- verification enforcement;
- persistent task state;
- skill routing;
- context-efficient execution.

The project is designed specifically for OpenCode.

## License

MIT © khnker
