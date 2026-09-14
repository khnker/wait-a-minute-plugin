# WAM Context Evaluation

## Why

A context router is only useful if it improves agent outcomes.

Token reduction alone is not sufficient. A smaller context that causes the
agent to miss a required dependency is a regression.

WAM needs an isolated benchmark capable of comparing context strategies.

## What

Introduce a deterministic context evaluation suite using synthetic and
realistic task graphs.

The evaluation must compare:

1. Full Context
2. Top-K Semantic Retrieval
3. WAM Context Routing

The benchmark runs without modifying OpenCode context.

## Goal

Determine whether WAM can select smaller context while maintaining or improving
task completion and verification.

## Non-goals

- No live OpenCode integration.
- No production traffic.
- No automatic optimization based on benchmark results.
