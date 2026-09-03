---
name: design-contract
description: design system contracts, token plans, anti-slop rules, state definitions, and critique loops
license: MIT
compatibility: opencode, claude-code
---

# Design Contract & System Governance

Enforce design system integrity and UI/UX predictability.

## Core Pillars

1. **Design Contracts**: Every component or view requires a documented contract in `.opencode/contracts/design.json` (or similar) BEFORE implementation. Defines intended layout, interactions, and constraints.
2. **Token Plans**: Mandatory use of design tokens (e.g., Tailwind config, CSS variables). NO magic values.
3. **Anti-Slop Rules**: No nested CSS overrides. No "just quick fix" styles. All components must adhere to established layout patterns.
4. **State Definitions**: Explicit definitions of component states (loading, error, success, hover, active).
5. **Critique Loops**: Post-implementation check against the initial design contract. If implementation drifts, it must be refactored before approval.

## Critique Loop Process

Before finalizing any UI task:

1. **Self-Audit**: Compare implementation against design contract.
2. **Drift Detection**: Identify layout, spacing, or styling inconsistencies.
3. **Refactor**: Fix identified drift immediately.
4. **Validation**: Mark as "Contract Compliant" only when drift is zero.
