# Design

## Scope representation

Normalize approved scope into matchable resources:

- repository-relative paths
- path prefixes/globs
- permitted resource classes
- explicitly excluded areas

## Action footprint

For each mutating action, derive an observable footprint:

- tool
- operation
- affected paths/resources
- mutation type
- external side effect class

## Decision

`evaluateScope(action, strategy)`

returns:

- `ALLOW`
- `ESCALATE`
- `BLOCK`

with reason and matched scope rule.

## Path safety

All repository paths SHALL be canonicalized before comparison.

Path traversal, symlink escapes where detectable, and absolute paths outside the repository SHALL not be treated as in-scope.

## Important distinction

Scope is not the same as risk.

An action can be:

- SAFE + out of scope
- GUARDED + in scope
- BLOCKED + in scope

Risk and scope decisions must remain independently observable.

## Telemetry

Record scope decisions with:

- action identity
- affected resource
- matched rule
- decision
- reason
