# Design

## Lifecycle

`VERIFYING -> REVIEWING -> DONE`

On review failure:

`REVIEWING -> REPLANNING` or `REVIEWING -> IMPLEMENTING`

depending on whether the issue requires a new hypothesis/strategy or a direct correction.

## Review input

Build a review snapshot containing:

- objective
- requirements
- evidence
- evidence provenance
- strategy and scope
- action footprint
- hypotheses
- rejected hypotheses
- experiments and outcomes
- changed resources
- unresolved assumptions
- verification results

## Review result

Return:

- `PASS`
- `REPLAN`
- `FIX`
- `BLOCK`

with structured findings.

## Independence

The review SHALL be logically separate from the completion gate.

The completion gate answers:

"Is there enough evidence to verify?"

The second-pass review answers:

"Does the whole execution record remain coherent and within contract?"

## Anti-loop protection

Repeated review failures for the same finding SHALL be detected and surfaced rather than causing unbounded autonomous cycling.

## DONE invariant

DONE is permitted only when:

1. requirements are verified;
2. evidence meets provenance requirements;
3. review passes;
4. no blocking scope/risk issue remains;
5. no blocking unknown/assumption remains.
