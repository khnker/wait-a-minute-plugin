# Change: Hypothesis Experiment Loop

## Objective
Provide persistent runtime support for hypothesis-driven autonomous problem solving.

## Why
Autonomy without a reasoning loop becomes "more tool calls". This change gives WAM a structured OBSERVE → HYPOTHESIZE → EXPERIMENT → OBSERVE → EVALUATE → REPLAN loop so the agent can iterate without asking the user for every decision.

## Non-goals
- This change does not implement a planner.
- It does not force a fixed number of experiments.
- It does not auto-retry failed actions without a new hypothesis.

## Core principle
The agent decides strategy. WAM persists the cognitive artifacts (hypotheses, experiments, observations) that allow continuation across compaction and replanning.
