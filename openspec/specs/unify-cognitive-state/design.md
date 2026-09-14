# Design

## Canonical ownership

`cognitive-state.js` is the sole owner of cognitive persistence.

Consumers SHALL NOT depend on:

- `hypotheses.jsonl`
- `experiments.jsonl`
- internal JSON layout
- implementation-specific compaction details

unless those files are explicitly part of the public persistence contract.

## API boundary

Expose operations for:

- load/save state
- add hypothesis
- reject hypothesis
- record experiment
- record observation
- query active/rejected hypotheses
- query recent experiments
- detect repeated experiments
- compact state

The implementation may change its physical representation without changing consumers.

## Migration

If legacy state exists, read it once through a compatibility loader and migrate it to the canonical representation.

Migration SHALL be idempotent.

## Invariants

1. A hypothesis exists in exactly one logical status.
2. Rejected hypotheses cannot remain active.
3. An experiment has a stable identity derived from its meaningful action/hypothesis inputs.
4. Repeated-experiment detection uses canonical state.
5. Tests exercise the public cognitive-state API, not storage internals.
