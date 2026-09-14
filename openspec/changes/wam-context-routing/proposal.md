# WAM Context Routing

## Why

Semantic retrieval alone can return context that is similar to the current
task but operationally irrelevant.

WAM needs to determine which context is actually necessary to execute the
current task.

## What

Introduce a task-aware Context Router.

Given an active task and a Context Graph, the router determines the minimum
sufficient context required for that task.

The router must consider:

1. task scope
2. explicit dependencies
3. required outputs
4. evidence
5. verification state
6. semantic relevance
7. token cost

## Goal

Produce a deterministic context selection without modifying OpenCode context.

## Non-goals

- No OpenCode integration.
- No automatic context mutation.
- No LLM-based routing.
- No destructive summarization.
- No token optimization at the expense of required evidence.
