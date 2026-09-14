# WAM Context Graph

## Why

WAM currently has requirements, evidence and task-oriented state, but lacks a
structured representation of how tasks, outputs, evidence and context relate.

A context system cannot rely only on semantic similarity. Relevant information
may have weak lexical similarity but be strongly connected through task
dependencies.

## What

Introduce an internal Context Graph that represents:

- tasks
- subtasks
- requirements
- claims
- actions
- observations
- evidence
- decisions
- constraints
- artifacts
- outputs

The graph must support typed relationships between these nodes.

The graph is an internal WAM component and must not modify OpenCode context yet.

## Goal

Provide the structural foundation required by context routing and evaluation.

## Non-goals

- Do not modify OpenCode messages.
- Do not intercept OpenCode context.
- Do not automatically compress context.
- Do not introduce an LLM-based summarizer.
- Do not require a specific vector database.
