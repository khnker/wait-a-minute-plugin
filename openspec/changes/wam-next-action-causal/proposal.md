# Causal Next Action

## Problem
nextAction is currently derived from the first pending requirement in a positional list. Requirement ordering does not necessarily represent execution dependency or causal order, leading to potentially incorrect agent actions.

## Goal
Derive nextAction from unresolved causal dependencies using the Context Graph.

## Success Criteria
- A blocked requirement is not selected while its prerequisite is unresolved.
- Independent requirements can be executed in parallel.
- The next action is explainable through graph dependencies.
