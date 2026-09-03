# Tasks

## Data Model

- [ ] Define structural index entry model.
- [ ] Define semantic dictionary entry model.
- [ ] Define association states: discovered, candidate, confirmed, invalid.
- [ ] Define evidence representation.
- [ ] Add repository identity and indexer version metadata.
- [ ] Add content-hash metadata.

## Structural Index

- [ ] Implement repository file indexing.
- [ ] Extract relevant symbols and structural metadata using existing WAM mechanisms where possible.
- [ ] Record imports/exports and relevant dependency relationships.
- [ ] Implement content hashing.
- [ ] Implement repository-scoped persistence.

## Change Detection

- [ ] Detect new files.
- [ ] Detect modified files.
- [ ] Detect deleted files.
- [ ] Detect renames/moves.
- [ ] Detect branch changes.
- [ ] Implement targeted invalidation.
- [ ] Reindex only affected entities and relationships.

## Semantic Dictionary

- [ ] Implement concept → candidate resolution.
- [ ] Support aliases.
- [ ] Store confidence.
- [ ] Store supporting evidence.
- [ ] Implement candidate/confirmed/invalid lifecycle.
- [ ] Prevent unconfirmed LLM inferences from becoming authoritative automatically.
- [ ] Preserve valid semantic associations when files are renamed or moved.

## Context Integration

- [ ] Run concept resolution before Context Selector.
- [ ] Feed dictionary candidates into existing context-selection pipeline.
- [ ] Ensure Context Selector remains responsible for minimum-context decisions.
- [ ] Ensure dictionary lookup does not bypass existing context-level rules.
- [ ] Ensure dictionary failures fall back to existing behavior.

## Reconciliation

- [ ] Implement stale-entry detection.
- [ ] Implement complete index rebuild.
- [ ] Reconcile semantic associations after structural rebuild.
- [ ] Invalidate associations whose targets no longer exist.
- [ ] Detect incompatible indexer versions.
- [ ] Add explicit rebuild capability.

## Tests

- [ ] Resolve known concept to confirmed file.
- [ ] Resolve unknown concept without creating fabricated association.
- [ ] Return multiple candidates for ambiguous concepts.
- [ ] Detect modified-file hash changes.
- [ ] Detect file creation.
- [ ] Detect deletion.
- [ ] Detect rename/move.
- [ ] Verify repository isolation.
- [ ] Verify persistence across sessions.
- [ ] Verify stale entries are not returned as authoritative.
- [ ] Verify candidate associations are not automatically promoted.
- [ ] Verify confirmed associations survive valid renames.
- [ ] Verify deleted targets invalidate semantic associations.
- [ ] Verify full rebuild produces consistent index.
- [ ] Verify indexer-version changes trigger reconciliation.
- [ ] Verify dictionary failure falls back to existing context discovery.
- [ ] Verify dictionary candidates are filtered by Context Selector.
- [ ] Verify existing four context levels continue to behave unchanged.
- [ ] Add performance test comparing dictionary lookup against broad repository discovery.
- [ ] Add token-cost test demonstrating that known concepts avoid unnecessary repository context.

## Acceptance Criteria

- [ ] known project concept can be resolved without broad repository exploration.
- [ ] Repository modifications cannot silently leave authoritative stale entries.
- [ ] Semantic associations remain repository-scoped.
- [ ] Incremental updates do not require full indexing for ordinary changes.
- [ ] Ambiguous concepts remain ambiguous until sufficient evidence exists.
- [ ] Context Dictionary improves retrieval without weakening Context Selector correctness.
- [ ] Existing WAM behavior remains functional when dictionary is empty, unavailable, or rebuilding.
