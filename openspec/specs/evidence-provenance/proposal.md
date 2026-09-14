# Proposal: Evidence Provenance

## Why

Completion verification is already substantially enforced, but evidence currently does not consistently express how the claim was established. A self-reported claim and a machine-observed test result should not carry the same verification weight.

## What changes

Add provenance to evidence and define minimum evidence strength by requirement/verification type.

## Provenance classes

- SELF_REPORTED
- OBSERVED
- COMMAND_OUTPUT
- TEST_RESULT
- MACHINE_VERIFIED

## Non-goals

- Do not reject all human/agent-reported evidence.
- Do not require tests for requirements that are inherently non-testable.
