# WAM — Next OpenSpec Changes

These changes were derived from the current WAM runtime review.

Recommended implementation order:

1. unify-cognitive-state
2. formalize-execution-transitions
3. enforce-scope-footprint
4. evidence-provenance
5. second-pass-review

Do not implement them all blindly in parallel. The first two establish runtime invariants that the later changes depend on.

Each change contains:
- proposal.md
- design.md
- tasks.md

These are planning artifacts; the actual repository implementation should be performed with the project's OpenSpec workflow and verified against the current code before merge.
