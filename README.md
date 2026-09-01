# Wait a Minute

Cognitive pre-flight and execution-control layer for OpenCode.

Wait a Minute (WAM) makes OpenCode agents understand before they act.

Before an agent starts executing a task, WAM performs a lightweight cognitive pre-flight: it analyzes the request, separates known facts from assumptions, identifies uncertainty, determines scope and task type, and selects relevant skills.

For tasks that require sustained implementation, WAM can establish a Completion Contract, track verified progress, and prevent premature completion.

> «Wait a minute. Understand first. Then act.»

## What WAM does

WAM operates as an OpenCode prompt hook before skill resolution and agent execution.

```
 USER PROMPT
    │
    ▼
 ┌──────────────────┐
 │  WAM PRE-FLIGHT  │
 └────────┬─────────┘
          │
 ┌─────────────┼─────────────┐
 ▼             ▼             ▼
 FACTS     ASSUMPTIONS     UNKNOWN
 │             │             │
 └─────────────┼─────────────┘
               ▼
      TASK CLASSIFICATION
               │
               ▼
         SKILL ROUTING
               │
               ▼
       EXECUTION / AGENT
               │
               ▼
 ┌─────────────────────┐
 │ COMPLETION CONTROL  │
 └──────────┬──────────┘
            │
    Evidence required
            │
            ▼
           DONE
```

WAM does not replace OpenCode's agent runtime. It controls the pre-flight and execution context around it.

---

## Cognitive Pre-flight

The central WAM mechanism is a prompt hook that runs before OpenCode resolves skills, selects the model/tier, or invokes the agent.

The pre-flight asks:

- What is the user actually asking for?
- What is already known?
- What is inferred from available evidence?
- What is merely assumed?
- What remains unknown?
- Does the repository need to be inspected first?
- What type of task is this?
- Which capabilities are relevant?
- Should the agent proceed or ask for clarification?

### Four-category reasoning

WAM explicitly separates information into four categories:

| Category | Meaning |
|----------|---------|
| KNOWN | Directly supported by the user, repository, tools, configuration or documentation |
| INFERRED | Reasonable conclusion derived from evidence |
| ASSUMED | Plausible but unverified assumption |
| UNKNOWN | Information that is currently unavailable |

This distinction is important because coding agents routinely turn assumptions into facts during execution.

WAM's job is to surface that boundary before the work starts.

---

## Completion Contracts

For implementation work, WAM can create a Completion Contract describing what must be true for the task to be considered complete.

A contract can contain:

- requirements;
- constraints;
- verification criteria;
- completion conditions.

The lifecycle is:

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
     ▼
   DONE
```

A contract remains "PROPOSED" until the user explicitly approves, edits, or rejects it.

This creates a boundary between:

> «"I understood what you want."»

And:

> «"I am authorized to proceed with this definition of done."»

---

## Evidence-Based Progress

WAM tracks requirements individually.

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

Each requirement has:

- an identifier;
- a status;
- optional evidence.

`nextAction` is derived from the first pending requirement.

This makes progress represent verified requirements, rather than the agent's narrative about what it has accomplished.

---

## Completion Gate

WAM actively guards completion.

It detects completion claims such as:

```
Done
Finished
Completed
Listo
Terminé
```

If the persisted task still contains pending requirements, WAM blocks the completion transition.

The incoming completion claim is rewritten into a directive to continue with the next unresolved requirement.

```
Agent: "Done. Everything is implemented."

WAM:
 R1 ✓
 R2 ✓
 R3 ✗

 DO NOT DECLARE DONE.
 Continue with R3.
```

When all requirements are verified, the task can transition to "DONE".

This is an enforcement mechanism, not merely a prompt reminder.

---

## Scope, Verify, Simplify

WAM includes persistent engineering policies that apply across tasks.

**Scope**

Detect unnecessary expansion of the requested change.

The goal is to prevent:

```
Requested change
    ↓
"while I'm here."
    ↓
Unrelated refactor
    ↓
Larger change surface
    ↓
New failure modes
```

**Verify**

Require evidence before accepting completion.

**Simplify**

Prefer the smallest solution that satisfies the requirement.

This includes:

- reuse existing mechanisms;
- avoid unnecessary abstractions;
- avoid speculative extensibility;
- avoid refactoring unrelated code.

These policies are part of WAM's persistent behavioral layer.

---

## Skill Intelligence

WAM also provides a self-contained skill catalog and routing system.

The bundled registry contains approximately 2,097 skills, including the complete `SKILL.md` content for each bundled skill.

External repositories are used only during registry generation. They are not accessed at runtime.

```
Skills/
└── registry.json
    ├── metadata
    ├── provenance
    └── SKILL.md content
```

Each skill retains provenance information including:

```
Source.id
Source.repository
Source.path
Source.ref
```

This makes the generated catalog reproducible and auditable.

### On-demand skill loading

WAM does not inject every skill into the agent context.

When routing selects a skill, its embedded `SKILL.md` is materialized locally:

```
.wam/
└── skills/
    └── bundled/
        └── <skill-id>/
            └── SKILL.md
```

OpenCode can then load the skill through its normal mechanism.

This keeps the large catalog out of the active context.

---

## Skill Routing

WAM uses a single weighted scoring algorithm:

```
Name × 5
Capability × 4
Keyword × 3
Description × 2
Domain × 1
```

Routing can be inspected rather than treated as a black box:

```
/wam skills explain <prompt>
```

Other useful commands:

```
/wam skills list
/wam skills search <query>
/wam skills inspect <id>
```

---

## Task Memory

WAM persists task state locally.

```
.wam/
└── tasks/
    └── <task-id>/
        ├── state.yaml
        ├── summary.md
        └── caveman-summary.md
```

The persisted state contains:

- completion contract;
- requirements;
- evidence;
- current phase;
- next action.

This allows a task to be resumed:

```
/wam task list
/wam task switch <id>
```

The selected task's state is re-injected on the next relevant prompt.

---

## Continuation Fast Path

WAM is deliberately not in the way on every message.

Once a contract is approved, ordinary continuation messages that do not contain a completion claim bypass the expensive pre-flight path.

```
Approved task
    │
    ▼
Normal continuation
    │
    ▼
OpenCode executes normally
```

WAM re-enters the control path when it needs to handle:

- a new task;
- a completion claim;
- explicit `/wam` operations.

This avoids repeatedly routing the large skill registry during normal execution.

---

## Context Efficiency

WAM treats injected context as a constrained resource.

WAM instructions use a compact "caveman" representation:

```
Understand task.
Check scope.
Verify evidence.
Do not declare DONE while requirements pending.
```

`/wam compress` produces a compact task summary and reports estimated context headroom.

```
Tokens N | headroom H / BUDGET
```

The default budget is 32,000 tokens and the estimate uses a lightweight character-based approximation rather than a model tokenizer.

---

## `/wam` CLI

**Skills**

```
/wam skills list
/wam skills search <query>
/wam skills inspect <id>
/wam skills explain <prompt>
```

**Contract**

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

---

## Architecture

WAM is intentionally an OpenCode plugin.

```
┌────────────────────────────────────────────┐
│                OpenCode                    │
│                                            │
│  Models · Agents · Tools · Runtime         │
│              │       │                     │
│              ▼       │                     │
│  ┌─────────────────────┐                   │
│  │        WAM          │                   │
│  │                     │                   │
│  │ Cognitive Pre-flight│                   │
│  │ Task Classification │                   │
│  │ Skill Routing       │                   │
│  │ Contracts           │                   │
│  │ Progress            │                   │
│  │ Evidence            │                   │
│  │ Completion Gate     │                   │
│  │ Task Memory         │                   │
│  └─────────────────────┘                   │
│                                            │
└────────────────────────────────────────────┘
```

The implementation is centered around:

| File        | Responsibility                                        |
|-------------|-------------------------------------------------------|
| `SKILL.md`  | WAM behavioral specification                         |
| `engine.js` | Pre-flight analysis · Task classification · Skill routing · Scoring · On-demand skill loading |
| `index.js`  | OpenCode plugin integration · Prompt hook · Contract lifecycle · Completion gate · `/wam` CLI |
| `memory.js` | Persistent task state · Summaries · Task resume      |

---

## Self-Contained Runtime

WAM's runtime does not depend on external skill repositories.

The maintainer pipeline:

```
External skill repositories
        │
        ▼
   Build-registry.cjs
        │
        ├── validate
        ├── deduplicate
        ├── pin revisions
        └── embed SKILL.md content
        │
        ▼
   Skills/registry.json
        │
        ▼
    WAM runtime
```

Users install WAM as a self-contained OpenCode plugin.

No network access to the upstream skill repositories is required at runtime.

---

## What WAM Is

WAM is:

- a pre-flight cognitive layer for OpenCode;
- a task understanding and classification mechanism;
- a skill intelligence layer;
- a completion-control mechanism;
- an evidence-based progress tracker;
- a persistent engineering-policy layer;
- a task memory and resume mechanism.

WAM is deliberately focused on OpenCode.

It does not attempt to replace OpenCode's agent runtime, model execution, or tool system.

---

## The Principle

Coding agents can execute very quickly while still operating on a wrong interpretation of the task.

The most expensive mistake is often not a failed command.

It is starting the wrong work confidently.

WAM introduces a deliberate pause:

```
Don't assume.
Understand.
Define.
Execute.
Verify.
Then finish.
```

Wait a Minute.
