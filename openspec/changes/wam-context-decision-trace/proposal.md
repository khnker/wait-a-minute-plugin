# Proposal: Context Decision Trace

## Problem
Context assembly decisions (what context to include/omit) are currently opaque. We need to explain deterministically why a node was included or omitted in the final Context Pack.

## Goal
Implement a machine-readable trace for every context admission decision, including source, dependency path, admission class, relevance, budget impact, and final assembly level.

## Success Criteria
- Deterministic trace records for every node in the context pack.
- Trace captures source of admission decision and path.
- Trace is machine-readable and reproducible.
- Integrated into diagnostic output (e.g., `/wam ctx trace <nodeId>`).
