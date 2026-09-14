# Design

## Evidence record

Each evidence item SHALL contain:

- requirement id
- provenance
- description
- source/reference
- timestamp
- result
- optional command/test identity

## Evidence strength

Suggested ordering:

`SELF_REPORTED < OBSERVED < COMMAND_OUTPUT < TEST_RESULT < MACHINE_VERIFIED`

Requirements define the minimum acceptable provenance.

Examples:

- qualitative implementation note → OBSERVED may be sufficient
- command behavior → COMMAND_OUTPUT
- regression requirement → TEST_RESULT
- machine-checkable invariant → MACHINE_VERIFIED

## Completion behavior

The completion gate SHALL reject evidence below the minimum required provenance.

A stronger evidence type satisfies weaker requirements.

## Compatibility

Legacy evidence without provenance is migrated as `SELF_REPORTED` unless the source can be determined reliably.
