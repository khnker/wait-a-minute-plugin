# Proposal: Second-Pass Review

## Why

WAM can currently reach completion after requirements and evidence pass verification. It still lacks an independent final review that can catch scope drift, unsupported assumptions, regressions, and incomplete evidence before DONE.

## What changes

Insert a REVIEWING phase after verification and before DONE.

The review SHALL inspect the accumulated execution record rather than merely asking the agent to "review its work".

## Review questions

At minimum:

- Are all requirements satisfied?
- Does every completion claim have sufficient evidence?
- Did the implementation exceed approved scope?
- Were failed hypotheses actually abandoned?
- Are unresolved assumptions still blocking?
- Did the change introduce a regression?
- Is verification reproducible?
- Does the final implementation match the approved objective?

## Non-goals

- Review is not a second implementation pass by default.
- Review SHALL NOT prescribe implementation details.
